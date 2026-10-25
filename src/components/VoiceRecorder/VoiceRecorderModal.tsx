import React, { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../../state/editorStore';
import {
  Mic,
  Square,
  Play,
  Pause,
  RotateCcw,
  Check,
  X,
  AlertCircle,
  Volume2,
  Sparkles,
  Radio,
} from 'lucide-react';
import { audioEngine } from '../../core/audio/audioEngine';

export const VoiceRecorderModal: React.FC = () => {
  const {
    isRecordModalOpen,
    setRecordModalOpen,
    addAsset,
    addAudioClip,
    currentTime,
    setLipSyncModalOpen,
    project,
  } = useEditorStore();

  const [state, setState] = useState<'idle' | 'recording' | 'paused' | 'review'>('idle');
  const [duration, setDuration] = useState<number>(0);
  const [volumeLevel, setVolumeLevel] = useState<number>(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
  const [recordingName, setRecordingName] = useState<string>('Voice-Over');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeUrlRef = useRef<string | null>(null);

  const revokeActiveUrl = () => {
    if (activeUrlRef.current) {
      try {
        URL.revokeObjectURL(activeUrlRef.current);
      } catch (_) {}
      activeUrlRef.current = null;
    }
  };

  // Clean up recording hardware on close
  const cleanupHardware = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.onstop = null;
          mediaRecorderRef.current.ondataavailable = null;
          mediaRecorderRef.current.stop();
        }
      } catch (_) {}
      mediaRecorderRef.current = null;
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
  };

  useEffect(() => {
    if (!isRecordModalOpen) {
      cleanupHardware();
      revokeActiveUrl();
      setState('idle');
      setDuration(0);
      setAudioBlob(null);
      setAudioUrl(null);
      setErrorMessage(null);
      setIsPlayingPreview(false);
    } else {
      setRecordingName(`Voice_${new Date().toLocaleTimeString().replace(/:/g, '-')}`);
    }
    return () => {
      cleanupHardware();
      revokeActiveUrl();
    };
  }, [isRecordModalOpen]);

  if (!isRecordModalOpen) return null;

  const startRecording = async () => {
    setErrorMessage(null);
    audioChunksRef.current = [];

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported by your browser environment.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Setup audio analyzer for live volume level meter
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateMeter = () => {
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            setVolumeLevel(Math.min(100, Math.round((avg / 128) * 100)));
          }
          animFrameRef.current = requestAnimationFrame(updateMeter);
        };
        updateMeter();
      }

      // Check supported MIME type
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        '',
      ].find((type) => !type || MediaRecorder.isTypeSupported(type)) || '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        cleanupHardware();
        const recordedDuration = Number(((performance.now() - startTime) / 1000).toFixed(1));
        if (audioChunksRef.current.length === 0) {
          setErrorMessage('No audio captured.');
          setState('idle');
          return;
        }

        const finalType = mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: finalType });
        if (blob.size === 0 || recordedDuration < 0.2) {
          setErrorMessage('Recording too short (minimum 0.2s required).');
          setState('idle');
          return;
        }

        revokeActiveUrl();
        const url = URL.createObjectURL(blob);
        activeUrlRef.current = url;
        setAudioBlob(blob);
        setAudioUrl(url);
        setDuration(recordedDuration);
        setState('review');
      };

      recorder.start(100); // 100ms chunks
      setState('recording');
      setDuration(0);

      const startTime = performance.now();
      timerRef.current = window.setInterval(() => {
        setDuration(Number(((performance.now() - startTime) / 1000).toFixed(1)));
      }, 100);
    } catch (err: unknown) {
      console.error('Microphone recording error:', err);
      let msg = 'Could not access microphone.';
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        msg = 'Microphone permission was denied. Please allow microphone access in your browser settings to record.';
      } else if (err instanceof DOMException && (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')) {
        msg = 'No microphone device was detected on your system.';
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setErrorMessage(msg);
      cleanupHardware();
      setState('idle');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const togglePreview = () => {
    if (!audioUrl) return;
    if (isPlayingPreview && previewAudioRef.current) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      const audio = new Audio(audioUrl);
      previewAudioRef.current = audio;
      audio.onended = () => setIsPlayingPreview(false);
      audio.play().catch(() => setIsPlayingPreview(false));
      setIsPlayingPreview(true);
    }
  };

  const handleSave = async (openLipSync = false) => {
    if (!audioBlob) return;

    try {
      const assetId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const savedAsset = await addAsset({
        id: assetId,
        name: `${recordingName}.webm`,
        type: 'audio',
        mimeType: audioBlob.type || 'audio/webm',
        blob: audioBlob,
        duration: Math.max(0.5, duration),
        createdAt: Date.now(),
      });

      // Place onto audio timeline at current playhead position
      addAudioClip({
        id: `aclip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        assetId: savedAsset.id,
        start: currentTime,
        duration: Math.max(0.5, duration),
        volume: 1.0,
        trimStart: 0,
        trimEnd: Math.max(0.5, duration),
      });

      revokeActiveUrl();
      setRecordModalOpen(false);

      if (openLipSync) {
        setLipSyncModalOpen(true);
      }
    } catch (err) {
      setErrorMessage('Failed to save audio recording.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-editor-panel border border-editor-border rounded-editor-lg max-w-md w-full shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="h-12 border-b border-editor-border px-4 flex items-center justify-between bg-editor-surface">
          <div className="flex items-center space-x-2">
            <Mic className="w-5 h-5 text-editor-accent" />
            <h3 className="font-semibold text-sm text-editor-text">
              Voice Recorder (Feature 04)
            </h3>
          </div>
          <button
            onClick={() => setRecordModalOpen(false)}
            className="w-7 h-7 rounded flex items-center justify-center text-editor-muted hover:text-editor-text hover:bg-editor-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col items-center justify-center space-y-5">
          {errorMessage && (
            <div className="w-full p-3 rounded-editor-md bg-red-950/40 border border-red-500/40 text-red-200 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Live meter / Visualizer Ring */}
          <div className="relative flex items-center justify-center">
            <div
              className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-100 ${
                state === 'recording'
                  ? 'bg-red-500/20 border-2 border-red-500 shadow-[0_0_24px_rgba(239,68,68,0.4)]'
                  : state === 'review'
                  ? 'bg-editor-accent/20 border-2 border-editor-accent'
                  : 'bg-editor-surface border border-editor-border'
              }`}
              style={{
                transform: state === 'recording' ? `scale(${1 + volumeLevel * 0.002})` : 'scale(1)',
              }}
            >
              {state === 'recording' ? (
                <Radio className="w-12 h-12 text-red-500 animate-pulse" />
              ) : state === 'review' ? (
                <Volume2 className="w-12 h-12 text-editor-accent" />
              ) : (
                <Mic className="w-12 h-12 text-editor-muted" />
              )}
            </div>

            {/* Volume indicator bar */}
            {state === 'recording' && (
              <div className="absolute -bottom-3 w-28 h-1.5 bg-editor-surface rounded-full overflow-hidden border border-editor-border">
                <div
                  className="h-full bg-red-500 transition-all duration-75"
                  style={{ width: `${volumeLevel}%` }}
                />
              </div>
            )}
          </div>

          {/* Time Display */}
          <div className="text-center space-y-1">
            <div className="font-mono text-3xl font-bold text-editor-text">
              {duration.toFixed(1)}s
            </div>
            <div className="text-xs text-editor-muted font-medium">
              {state === 'recording'
                ? 'Recording live audio...'
                : state === 'review'
                ? 'Review & save recording'
                : 'Click button below to start microphone capture'}
            </div>
          </div>

          {/* Controls */}
          {state === 'idle' && (
            <button
              onClick={startRecording}
              className="py-2.5 px-6 rounded-editor-md bg-red-600 hover:bg-red-500 text-white font-semibold text-xs flex items-center space-x-2 shadow-lg hover:shadow-red-500/20 transition-all active:scale-95"
            >
              <Mic className="w-4 h-4" />
              <span>Start Recording</span>
            </button>
          )}

          {state === 'recording' && (
            <div className="flex items-center space-x-3">
              <button
                onClick={stopRecording}
                className="py-2.5 px-6 rounded-editor-md bg-red-600 hover:bg-red-500 text-white font-semibold text-xs flex items-center space-x-2 shadow-lg transition-all active:scale-95"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Stop & Review</span>
              </button>
            </div>
          )}

          {state === 'review' && (
            <div className="w-full space-y-4">
              <div>
                <label className="text-[11px] text-editor-muted block mb-1">Recording Name</label>
                <input
                  type="text"
                  value={recordingName}
                  onChange={(e) => setRecordingName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-editor-surface border border-editor-border rounded text-xs text-editor-text focus:outline-none focus:border-editor-accent"
                />
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={togglePreview}
                  className="flex-1 py-2 px-3 rounded-editor-md bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-editor-text text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                >
                  {isPlayingPreview ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>Pause Preview</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Play Preview</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    cleanupHardware();
                    revokeActiveUrl();
                    setState('idle');
                    setDuration(0);
                    setAudioBlob(null);
                    setAudioUrl(null);
                  }}
                  title="Discard and re-record"
                  className="py-2 px-3 rounded-editor-md bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-editor-muted hover:text-red-400 text-xs transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-editor-border">
                <button
                  onClick={() => handleSave(false)}
                  className="py-2.5 px-3 rounded-editor-md bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-editor-text text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <Check className="w-3.5 h-3.5 text-editor-success" />
                  <span>Add to Timeline</span>
                </button>
                <button
                  onClick={() => handleSave(true)}
                  className="py-2.5 px-3 rounded-editor-md bg-editor-accentAction hover:bg-editor-accent text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Lip-Sync Now</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
