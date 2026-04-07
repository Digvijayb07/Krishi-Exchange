'use client'

import { useState, useEffect } from 'react'
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
        rec.lang = 'hi-IN'

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
          if (finalTranscript) {
            setTranscript((prev) => prev + finalTranscript)
            if (shouldOpenMarketplace(finalTranscript)) {
              handleMarketplaceCommand(finalTranscript)
            }
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

  const shouldOpenMarketplace = (text: string) => {
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/gi, ' ')
    return /\b(sell|selling|sale|buy|search|find|purchase|market|shop|shopping)\b/.test(normalized)
  }

  const shouldOpenListModal = (text: string) => {
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/gi, ' ')
    return /\b(sell|selling|sale)\b/.test(normalized)
  }

  const extractSearchQuery = (text: string) => {
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/gi, ' ').trim()
    const genericKeywords = ['something', 'anything', 'everything', 'stuff', 'items', 'things']

    const patterns = [
      /(?:buy|search for|search|find|purchase|looking for|want to buy|need to buy|want|need|looking)\s+(.+)/i,
      /(?:i want to buy|i want to|i need to buy|i need to|please|could you|can you)\s+(.+)/i,
    ]

    for (const pattern of patterns) {
      const match = normalized.match(pattern)
      if (match?.[1]) {
        const query = match[1].trim()
        if (!genericKeywords.includes(query) && !genericKeywords.some((word) => query === word || query.startsWith(`${word} `))) {
          return query
        }
        return undefined
      }
    }

    const cleaned = normalized
      .replace(/\b(search|buy|find|purchase|looking for|want to buy|need to buy|want|need|market|shop|shopping)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!cleaned || genericKeywords.includes(cleaned) || genericKeywords.some((word) => cleaned === word || cleaned.startsWith(`${word} `))) {
      return undefined
    }

    return cleaned
  }

  const dispatchMarketplaceEvent = (detail: {
    openListModal?: boolean
    searchQuery?: string
    closeListModal?: boolean
  }) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('voice-assistant-marketplace', { detail }))
  }

  const handleMarketplaceCommand = (text: string) => {
    const openListModal = shouldOpenListModal(text)
    const searchQuery = openListModal ? undefined : extractSearchQuery(text)
    const isMarketplace = pathname?.startsWith('/marketplace')

    if (isMarketplace) {
      dispatchMarketplaceEvent({
        openListModal,
        searchQuery,
        closeListModal: !openListModal,
      })
    } else {
      const params = new URLSearchParams()
      if (openListModal) params.set('openListModal', '1')
      if (searchQuery) params.set('query', searchQuery)
      const url = `/marketplace${params.toString() ? `?${params.toString()}` : ''}`
      router.push(url)
    }
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
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {transcript}
                <span className="text-gray-500 italic">{interimTranscript}</span>
                {!transcript && !interimTranscript && <span className="text-gray-400">Start speaking to see transcript...</span>}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
