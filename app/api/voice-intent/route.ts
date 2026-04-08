import { NextResponse } from "next/server"

export async function POST(req: Request) {

  type VoiceIntent = {
  intent: string
  query?: string
  question?: string
  answer?: string
 }

  try {
    const { text } = await req.json()

    if (!text) {
      return NextResponse.json(
        { error: "No text provided" },
        { status: 400 }
      )
    }

    const systemPrompt = `
You are a voice assistant for an online marketplace website.

Convert the user speech into a JSON command.

Supported intents:
1. search_product
2. sell_product
3. open_marketplace
4. general_question
5. none

Rules:
- Return ONLY valid JSON
- Do not include explanations
- Ignore greetings like "hello", "hi", etc.
- If the user mentions buying something, always return search_product
- If the user mentions selling something, return sell_product
- Extract the product name and ALWAYS return it in English.
- If the user speaks Hindi, Marathi, or Hinglish, translate the product name to English.

Examples:
"pyaaj" → onion
"aloo" → potato
"tamatar" → tomato
"doodh" → milk

Examples:

User: "I want to buy onions"
Output: {"intent":"search_product","query":"onions"}

User: "buy rice"
Output: {"intent":"search_product","query":"rice"}

User: "mujhe pyaaj kharidna hai"
Output: {"intent":"search_product","query":"onions"}

User: "sell my tomatoes"
Output: {"intent":"sell_product","item":"tomatoes"}

User: "I want to sell potatoes"
Output: {"intent":"sell_product","item":"potatoes"}

User: "open marketplace"
Output: {"intent":"open_marketplace"}

User: "show me the market"
Output: {"intent":"open_marketplace"}

User: "Hello I want to buy rice"
Output: {"intent":"search_product","query":"rice"}

User: "Hi I want rice"
Output: {"intent":"search_product","query":"rice"}

User: "I want to sell wheat"
Output: {"intent":"sell_product","item":"wheat"}

User: "I want to sell something"
Output: {"intent":"sell_product"}

If you cannot determine intent:
{"intent":"none"}

User: "mujhe pyaaj kharidna hai"
Output: {"intent":"search_product","query":"onion"}

User: "mujhe aloo chahiye"
Output: {"intent":"search_product","query":"potato"}

User: "tamatar kharidna hai"
Output: {"intent":"search_product","query":"tomato"}

User: "buy onions"
Output: {"intent":"search_product","query":"onion"}

User: "current cost of onions"
Output:
{"intent":"general_question","question":"current cost of onions"}

User: "what is today's onion price"
Output:
{"intent":"general_question","question":"today onion price"}

Do NOT wrap JSON in markdown or code blocks.
`

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0,
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: text
            }
          ]
        })
      }
    )

    const data = await response.json()

    const content = data.choices?.[0]?.message?.content || ""

    console.log("LLM CONTENT:", content)

    const match = content.match(/\{[\s\S]*\}/)

    let parsed: VoiceIntent = { intent: "none" }

    if (match) {
      try {
        parsed = JSON.parse(match[0])
      } catch (err) {
        console.error("JSON parse failed:", match[0])
      }
    }

    if (parsed.intent === "general_question") {

      const answerResponse = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            temperature: 0.5,
            messages: [
              {
                role: "system",
                content: `
You are a helpful agricultural marketplace voice assistant.

Always reply in simple Hindi.

Keep answers short because the response will be spoken by a voice assistant.
`
              },
              {
                role: "user",
                content: parsed.question || parsed.query
              }
            ]
          })
        }
      )

      const answerData = await answerResponse.json()

     parsed.answer =
  answerData.choices?.[0]?.message?.content || "माफ़ कीजिए, मुझे जानकारी नहीं मिली।"
    }

    return NextResponse.json(parsed)

  } catch (error) {
    console.error("Voice intent error:", error)

    return NextResponse.json(
      { intent: "none" },
      { status: 500 }
    )
  }
}