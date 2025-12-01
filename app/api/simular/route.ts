import { NextRequest, NextResponse } from "next/server"

type Body = {
  precio_actual: number
  volatilidad: number
  dias: number
  simulaciones: number
}

// Normal N(0,1) con Box‑Muller
function gaussianRandom(): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const pos = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(pos)
  const upper = Math.ceil(pos)

  if (lower === upper) return sorted[lower]

  const weight = pos - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Body>
    const { precio_actual, volatilidad, dias, simulaciones } = body

    // Validaciones básicas
    if (
      typeof precio_actual !== "number" ||
      typeof volatilidad !== "number" ||
      typeof dias !== "number" ||
      typeof simulaciones !== "number"
    ) {
      return NextResponse.json(
        { error: "Parámetros inválidos" },
        { status: 400 },
      )
    }

    if (precio_actual <= 0) {
      return NextResponse.json(
        { error: "El precio actual debe ser mayor que 0" },
        { status: 400 },
      )
    }

    if (volatilidad < 0 || volatilidad > 200) {
      return NextResponse.json(
        { error: "La volatilidad debe estar entre 0 y 200" },
        { status: 400 },
      )
    }

    if (dias < 1 || dias > 365) {
      return NextResponse.json(
        { error: "Los días deben estar entre 1 y 365" },
        { status: 400 },
      )
    }

    if (simulaciones < 100 || simulaciones > 10000) {
      return NextResponse.json(
        { error: "Las simulaciones deben estar entre 100 y 10000" },
        { status: 400 },
      )
    }

    const valorBase = precio_actual
    const volDiaria = volatilidad / 100 / Math.sqrt(252)
    const deltaT = 1 / 252
    const tasaInteres = 0

    const pasosTiempo = dias
    const numTrayectorias = simulaciones

    // matriz [numTrayectorias][pasosTiempo+1]
    const simulacionesArr: number[][] = Array.from(
      { length: numTrayectorias },
      () => Array(pasosTiempo + 1).fill(valorBase),
    )

    // Simulación tipo movimiento browniano geométrico
    for (let paso = 1; paso <= pasosTiempo; paso++) {
      for (let i = 0; i < numTrayectorias; i++) {
        const ruido = gaussianRandom()
        const exponencial =
          (tasaInteres - 0.5 * volDiaria * volDiaria) * deltaT
        const gaussiano = volDiaria * Math.sqrt(deltaT) * ruido

        simulacionesArr[i][paso] =
          simulacionesArr[i][paso - 1] *
          Math.exp(exponencial + gaussiano)
      }
    }

    // Estadísticas por paso
    const promedio: number[] = []
    const percentil_5: number[] = []
    const percentil_95: number[] = []

    for (let paso = 0; paso <= pasosTiempo; paso++) {
      const columna = simulacionesArr.map((fila) => fila[paso])
      promedio.push(mean(columna))
      percentil_5.push(percentile(columna, 5))
      percentil_95.push(percentile(columna, 95))
    }

    // Precios finales
    const preciosFinales = simulacionesArr.map((fila) => fila[pasosTiempo])
    const precio_final_promedio = mean(preciosFinales)
    const precio_final_minimo = Math.min(...preciosFinales)
    const precio_final_maximo = Math.max(...preciosFinales)

    // VaR al 95%
    const cambios = preciosFinales.map((v) => (v - valorBase) / valorBase)
    const pRiesgo = percentile(cambios, 5) // suele ser negativo
    const var_95 = valorBase * Math.abs(pRiesgo)
    const var_percentaje = pRiesgo * 100

    return NextResponse.json({
      simulaciones: simulacionesArr,
      promedio,
      percentil_5,
      percentil_95,
      precio_final_promedio,
      precio_final_minimo,
      precio_final_maximo,
      var_95,
      var_percentaje,
    })
  } catch (error) {
    console.error("Error en /api/simular", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    )
  }
}

// Por si alguien entra con GET en el navegador
export function GET() {
  return NextResponse.json(
    { error: "Usa POST para esta ruta" },
    { status: 405 },
  )
}
