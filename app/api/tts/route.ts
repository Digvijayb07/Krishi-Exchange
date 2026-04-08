import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    console.log("Eleven key loaded:", process.env.ELEVENLABS_API_KEY?.slice(0,6))

    const { text } = await req.json()

    const response = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM",
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY!,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5
          }
        })
      }
    )

   
    // 🚨 check if ElevenLabs failed
    if (!response.ok) {
      const errorText = await response.text()
      console.error("ElevenLabs error:", errorText)
      return NextResponse.json({ error: "TTS failed", details: errorText }, { status: 500 })
    }

    // Check if response is actually audio
    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.startsWith("audio/")) {
      const errorText = await response.text()
      console.error("ElevenLabs returned non-audio:", contentType, errorText)
      return NextResponse.json({ error: "Invalid audio response", details: errorText }, { status: 500 })
    }

    const buffer = await response.arrayBuffer()

    console.log("ElevenLabs audio size:", buffer.byteLength)

    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/mpeg"
      }
    })

  } catch (error) {
    console.error("TTS route error:", error)
    return NextResponse.json({ error: "TTS failed" }, { status: 500 })
  }
}