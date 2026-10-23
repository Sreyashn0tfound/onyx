'use client';

import { useState, useRef, useCallback } from 'react';
import { transcribeAudioAction } from '@/app/actions';

interface UseSpeechToTextOptions {
  onTranscript?: (text: string) => void;
}

export function useSpeechToText(options?: UseSpeechToTextOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const textAccumulatorRef = useRef<string>('');
  const receivedWebSpeechResultRef = useRef<boolean>(false);

  const stopAll = useCallback(() => {
    setIsListening(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const toggleListening = useCallback(
    async (
      currentInput: string,
      onTextUpdate: (text: string) => void
    ) => {
      // If currently listening, stop and finalize
      if (isListening) {
        stopAll();
        return;
      }

      setMicError(null);
      textAccumulatorRef.current = currentInput.trim();
      receivedWebSpeechResultRef.current = false;
      audioChunksRef.current = [];

      // 1. Request microphone permission explicitly
      let stream: MediaStream;
      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('getUserMedia not supported in this browser environment.');
        }
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      } catch (err: any) {
        const msg =
          err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
            ? 'Microphone permission denied. Please allow microphone access in your browser address bar.'
            : `Microphone unavailable: ${err?.message || 'Check your audio input device.'}`;
        setMicError(msg);
        console.error('[SpeechToText]', msg, err);
        alert(msg);
        return;
      }

      // 2. Set up MediaRecorder as backup / primary high-accuracy Whisper fallback
      try {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
        const mediaRecorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const chunks = audioChunksRef.current;
          audioChunksRef.current = [];

          // If WebSpeech already captured text, don't need Whisper fallback
          if (receivedWebSpeechResultRef.current && textAccumulatorRef.current) {
            return;
          }

          if (chunks.length === 0) return;

          const audioBlob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
          if (audioBlob.size < 1000) return; // Too short/silent

          setIsTranscribing(true);
          try {
            const formData = new FormData();
            const ext = mediaRecorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
            formData.append('audio', audioBlob, `input.${ext}`);

            const res = await transcribeAudioAction(formData);
            if (res.success && res.text && res.text.trim()) {
              const base = textAccumulatorRef.current;
              const combined = base ? `${base} ${res.text.trim()}` : res.text.trim();
              textAccumulatorRef.current = combined;
              onTextUpdate(combined);
              options?.onTranscript?.(combined);
            }
          } catch (transcribeErr) {
            console.error('[Whisper STT Error]', transcribeErr);
          } finally {
            setIsTranscribing(false);
          }
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(250); // collect every 250ms
      } catch (recErr) {
        console.warn('[MediaRecorder Init]', recErr);
      }

      // 3. Set up Web Speech API for instant live feedback if available
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';

          const baseText = textAccumulatorRef.current;

          recognition.onresult = (event: any) => {
            let sessionSpeech = '';
            for (let i = 0; i < event.results.length; ++i) {
              sessionSpeech += event.results[i][0].transcript;
            }
            if (sessionSpeech.trim()) {
              receivedWebSpeechResultRef.current = true;
              const combined = baseText
                ? `${baseText} ${sessionSpeech.trim()}`
                : sessionSpeech.trim();
              onTextUpdate(combined);
              options?.onTranscript?.(combined);
            }
          };

          recognition.onerror = (e: any) => {
            console.warn('[WebSpeech Warning]', e?.error);
            // Don't stop MediaRecorder; let Whisper transcribe the audio on stop
          };

          recognition.onend = () => {
            // If ended naturally but still listening state, stop cleanly
            if (isListening) {
              stopAll();
            }
          };

          recognitionRef.current = recognition;
          recognition.start();
        } catch (e) {
          console.warn('[WebSpeech Start]', e);
        }
      }

      setIsListening(true);
    },
    [isListening, options, stopAll]
  );

  return {
    isListening,
    isTranscribing,
    micError,
    toggleListening,
    stopListening: stopAll,
  };
}
