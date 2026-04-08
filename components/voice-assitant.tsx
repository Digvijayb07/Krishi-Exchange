'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Mic, MicOff } from 'lucide-react'

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: (event: SpeechRecognitionEvent) => void
  onend: () => void
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}

export default function VoiceAssistant() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null)

  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([])


  // Exclude from disputes page
  if (pathname === '/disputes') {
    return null
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognitionAPI) {
        const rec = new SpeechRecognitionAPI()
        rec.continuous = true
        rec.interimResults = true
        rec.lang = 'en-IN'

        rec.onresult = (event: any) => {
          let finalTranscript = ''
          let interim = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' '
            } else {
              interim += transcript
            }
          }
          if (finalTranscript.trim().length > 3) {
            setMessages((prev) => [
              ...prev,
              { role: "user", text: finalTranscript }
            ])

            processVoiceCommand(finalTranscript.trim())
          }
          setInterimTranscript(interim)
        }

        rec.onend = () => {
          setIsListening(false)
        }

        setRecognition(rec)
      }
    }
  }, [])

  const router = useRouter()
  const closePopupTimeout = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const schedulePopupClose = () => {
    if (typeof window === 'undefined') return
    if (closePopupTimeout.current) {
      window.clearTimeout(closePopupTimeout.current)
      closePopupTimeout.current = null
    }

    closePopupTimeout.current = window.setTimeout(() => {
      setIsOpen(false)
      closePopupTimeout.current = null
    }, 2000)
  }

  useEffect(() => {
    return () => {
      if (closePopupTimeout.current) {
        window.clearTimeout(closePopupTimeout.current)
      }
    }
  }, [])

  const speakText = (text: string) => {
    if (audioRef.current) {
      speechSynthesis.cancel()
    }

    const utterance = new SpeechSynthesisUtterance(text)

    utterance.lang = "hi-IN"   // Hindi voice
    utterance.rate = 1
    utterance.pitch = 1

    speechSynthesis.speak(utterance)
  }

  const processVoiceCommand = async (text: string) => {
    try {

      const res = await fetch("/api/voice-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
      })

      const intent = await res.json()

      console.log("Voice Intent FULL:", JSON.stringify(intent, null, 2))

      if (intent.intent === "none") {

        if (text.toLowerCase().includes("buy")) {
          intent.intent = "search_product"
        }

        if (text.toLowerCase().includes("sell")) {
          intent.intent = "sell_product"
        }

      }

      switch (intent.intent) {

        case "search_product":
          console.log("Navigating to marketplace with query:", intent.query)
          if (pathname?.startsWith("/marketplace")) {
            dispatchMarketplaceEvent({ closeListModal: true, searchQuery: intent.query })
          }
          router.push(`/marketplace?query=${encodeURIComponent(intent.query)}`)
          schedulePopupClose()
          break

        case "sell_product":
          console.log("Navigating to marketplace to open list modal")
          router.push(`/marketplace?openListModal=true${intent.item ? `&item=${encodeURIComponent(intent.item)}` : ''}`)
          schedulePopupClose()
          break

        case "open_marketplace":
          console.log("Navigating to marketplace")
          router.push("/marketplace")
          schedulePopupClose()
          break

        case "general_question":
          if (intent.answer) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", text: intent.answer }
            ])

            speakText(intent.answer)
          }
          break

        default:
          console.log("No actionable intent detected:", intent.intent)
      }

    }
    catch (err) {
      console.error("Voice command error:", err)
    }
  }

  const dispatchMarketplaceEvent = (detail: {
    openListModal?: boolean
    searchQuery?: string
    closeListModal?: boolean
  }) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('voice-assistant-marketplace', { detail }))
  }

  const startListening = () => {
    if (!recognition) return
    try {
      setTranscript('')
      setInterimTranscript('')
      recognition.start()
      setIsListening(true)
    } catch (err) {
      console.log('Recognition already running')
    }
  }

  const stopListening = () => {
    if (recognition && isListening) {
      recognition.stop()
      setIsListening(false)
    }
  }

  const handleOpen = () => {
    setIsOpen(true)
    startListening()
  }

  const handleClose = () => {
    setIsOpen(false)
    stopListening()
  }

  return (
    <>
      {/* Floating Button */}
      <Button
        onClick={handleOpen}
        className="fixed bottom-4 right-4 z-50 rounded-full w-16 h-16 p-0 shadow-lg hover:shadow-xl transition-shadow"
        size="icon"
      >
        <Mic className="w-8 h-8" />
      </Button>

      {/* Dialog Popup */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md max-h-[600px] flex flex-col">
          <DialogHeader>
            <DialogTitle>Voice Assistant</DialogTitle>
          </DialogHeader>
          <div className="flex-1 flex flex-col space-y-4">
            <div className="flex items-center gap-2">
              <Button
                onClick={isListening ? stopListening : startListening}
                variant={isListening ? 'destructive' : 'default'}
                size="sm"
              >
                {isListening ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                {isListening ? 'Stop' : 'Start'} Listening
              </Button>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg min-h-[300px] max-h-[400px] overflow-y-auto flex-1">
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`text-sm p-2 rounded-lg ${msg.role === "user"
                      ? "bg-blue-100 text-right"
                      : "bg-gray-200"
                      }`}
                  >
                    {msg.text}
                  </div>
                ))}

                {interimTranscript && (
                  <div className="text-gray-400 italic">
                    {interimTranscript}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}