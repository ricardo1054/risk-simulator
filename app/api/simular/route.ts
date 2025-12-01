import { type NextRequest, NextResponse } from "next/server"

interface ParametrosSimulacion {
  precio_actual: number
  volatilidad: number
  dias: number
  simulaciones: number
}

interface ResultadoSimulacion {
  simulaciones: number[][]
  promedio: number[]
  percentil_5: number[]
  percentil_95: number[]
  precio_final_promedio: number
  precio_final_minimo: number
  precio_final_maximo: number
  var_95: number
  var_percentaje: number
}

function generarNumerosAleatorios(cantidad: number): number[] {
  const resultado: number[] = []
  for (let i = 0; i < cantidad; i++) {
    let u1 = 0,
      u2 = 0
    while (u1 === 0) u1 = Math.random() // Convertir (0,1] en lugar de [0,1)
    while (u2 === 0) u2 = Math.random()
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)
    resultado.push(z)
  }
  return resultado
}

function calcularRandomWalk(
  precioInicial: number,
  volatilidad: number,
  dias: number,
  numSimulaciones: number,
): ResultadoSimulacion {
  // Convertir parámetros
  const volDiaria = volatilidad / 100 / Math.sqrt(252) // Volatilidad diaria
  const rfRate = 0.0 // Tasa libre de riesgo
  const dt = 1 / 252 // Fracción de año (un día)

  // Inicializar matriz de simulaciones
  const simulaciones: number[][] = Array(numSimulaciones)
    .fill(null)
    .map(() => Array(dias + 1).fill(0))

  // Establecer precio inicial
  for (let i = 0; i < numSimulaciones; i++) {
    simulaciones[i][0] = precioInicial
  }

  // Generar caminos aleatorios usando Movimiento Browniano Geométrico
  for (let t = 1; t <= dias; t++) {
    const z = generarNumerosAleatorios(numSimulaciones)

    for (let i = 0; i < numSimulaciones; i++) {
      // Fórmula: S_t = S_{t-1} * exp((r - 0.5*sigma^2)*dt + sigma*sqrt(dt)*z)
      simulaciones[i][t] =
        simulaciones[i][t - 1] * Math.exp((rfRate - 0.5 * volDiaria ** 2) * dt + volDiaria * Math.sqrt(dt) * z[i])
    }
  }

  // Calcular promedios
  const promedio: number[] = []
  for (let t = 0; t <= dias; t++) {
    let suma = 0
    for (let i = 0; i < numSimulaciones; i++) {
      suma += simulaciones[i][t]
    }
    promedio.push(suma / numSimulaciones)
  }

  // Calcular percentil 5 y 95
  const percentil5: number[] = []
  const percentil95: number[] = []

  for (let t = 0; t <= dias; t++) {
    const valores = simulaciones.map((sim) => sim[t]).sort((a, b) => a - b)
    percentil5.push(valores[Math.floor(numSimulaciones * 0.05)])
    percentil95.push(valores[Math.floor(numSimulaciones * 0.95)])
  }

  // Precios finales
  const preciosFinales = simulaciones.map((sim) => sim[dias])
  const precioFinalPromedio = preciosFinales.reduce((a, b) => a + b, 0) / numSimulaciones
  const precioFinalMinimo = Math.min(...preciosFinales)
  const precioFinalMaximo = Math.max(...preciosFinales)

  // Calcular VaR 95%: pérdida máxima con 95% de confianza
  const retornos = preciosFinales.map((precio) => (precio - precioInicial) / precioInicial)
  const retornosOrdenados = [...retornos].sort((a, b) => a - b)
  const var95Percentaje = retornosOrdenados[Math.floor(numSimulaciones * 0.05)]
  const var95Valor = precioInicial * Math.abs(var95Percentaje)

  return {
    simulaciones,
    promedio,
    percentil_5: percentil5,
    percentil_95: percentil95,
    precio_final_promedio: precioFinalPromedio,
    precio_final_minimo: precioFinalMinimo,
    precio_final_maximo: precioFinalMaximo,
    var_95: var95Valor,
    var_percentaje: var95Percentaje * 100,
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: ParametrosSimulacion = await request.json()

    // Validaciones
    if (body.precio_actual <= 0) {
      return NextResponse.json({ error: "El precio debe ser mayor a 0" }, { status: 400 })
    }
    if (body.volatilidad < 0 || body.volatilidad > 200) {
      return NextResponse.json({ error: "La volatilidad debe estar entre 0 y 200%" }, { status: 400 })
    }
    if (body.dias < 1 || body.dias > 365) {
      return NextResponse.json({ error: "Los días deben estar entre 1 y 365" }, { status: 400 })
    }
    if (body.simulaciones < 100 || body.simulaciones > 10000) {
      return NextResponse.json({ error: "Las simulaciones deben estar entre 100 y 10000" }, { status: 400 })
    }

    // Ejecutar simulación
    const resultado = calcularRandomWalk(body.precio_actual, body.volatilidad, body.dias, body.simulaciones)

    return NextResponse.json(resultado)
  } catch (error) {
    console.error("[v0] Error en simulación:", error)
    return NextResponse.json({ error: "Error procesando la simulación" }, { status: 500 })
  }
}
