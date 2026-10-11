"use client";

/* Captured previews use short-lived browser Blob URLs. */
/* eslint-disable @next/next/no-img-element */

import {
  Camera,
  CameraOff,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

type Phase = "idle" | "opening" | "camera" | "captured" | "submitting" | "success" | "error";

function messageFrom(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : null;
}

function cameraError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "Camera access was blocked. Allow it in your browser and try again.";
    if (error.name === "NotFoundError") return "No camera was found on this device.";
    if (error.name === "NotReadableError") return "Your camera is being used by another application.";
  }
  return "The camera could not be opened. Please try again.";
}

export function SelfRegistrationForm() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const photoRef = useRef<Blob | null>(null);
  const previewRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registeredId, setRegisteredId] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const clearPhoto = useCallback(() => {
    photoRef.current = null;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setPreview(null);
  }, []);

  useEffect(() => () => {
    stopCamera();
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, [stopCamera]);

  const openCamera = useCallback(async () => {
    stopCamera();
    clearPhoto();
    setError(null);
    setRegisteredId(null);
    setPhase("opening");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support camera capture.");
      setPhase("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      if (!videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
      setPhase("camera");
    } catch (cameraFailure) {
      setError(cameraError(cameraFailure));
      setPhase("error");
    }
  }, [clearPhoto, stopCamera]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setError("The camera is still getting ready. Wait a moment and try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const photo = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!photo) {
      setError("The photo could not be captured. Please try again.");
      return;
    }
    clearPhoto();
    photoRef.current = photo;
    previewRef.current = URL.createObjectURL(photo);
    setPreview(previewRef.current);
    stopCamera();
    setPhase("captured");
  }, [clearPhoto, stopCamera]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photoRef.current || phase === "submitting") {
      setError("Capture a clear face photo before registering.");
      return;
    }
    setError(null);
    setPhase("submitting");
    const formData = new FormData(event.currentTarget);
    formData.set("image", new File([photoRef.current], "self-registration.jpg", { type: "image/jpeg" }));
    try {
      const response = await fetch("/api/admin/self-register", { method: "POST", body: formData });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageFrom(payload) ?? "Registration could not be completed.");
      const externalId =
        payload && typeof payload === "object" && typeof (payload as { externalId?: unknown }).externalId === "string"
          ? (payload as { externalId: string }).externalId
          : "";
      setRegisteredId(externalId);
      setPhase("success");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Registration could not be completed.");
      setPhase("captured");
    }
  }

  const inputClass =
    "mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

  return (
    <form className="grid gap-6 lg:grid-cols-[1fr_1.05fr]" onSubmit={(event) => void submit(event)}>
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="font-semibold text-slate-950">1. Capture your face</h2>
          <p className="mt-1 text-sm text-slate-500">Use a clear, front-facing photo with only one person visible.</p>
        </div>
        <div className="p-5">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-950">
            {phase === "camera" || phase === "opening" ? (
              <>
                <video ref={videoRef} autoPlay muted playsInline className="size-full object-cover" />
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="h-[72%] w-[55%] rounded-[48%] border-2 border-white/90 shadow-[0_0_0_999px_rgba(15,23,42,0.25)]" />
                </div>
                {phase === "opening" && (
                  <div className="absolute inset-0 grid place-items-center bg-slate-950/50 text-white">
                    <LoaderCircle className="size-8 animate-spin" />
                  </div>
                )}
              </>
            ) : preview ? (
              <img src={preview} alt="Captured registration photo" className="size-full object-cover" />
            ) : (
              <div className="flex size-full flex-col items-center justify-center text-slate-300">
                <CameraOff className="size-10" />
                <p className="mt-3 text-sm">Camera is off</p>
              </div>
            )}
          </div>
          <div className="mt-4 flex gap-3">
            {phase === "camera" ? (
              <button type="button" onClick={() => void capture()} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
                <Camera className="size-4" /> Capture photo
              </button>
            ) : (
              <button type="button" onClick={() => void openCamera()} disabled={phase === "opening" || phase === "submitting"} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60">
                {preview ? <RefreshCw className="size-4" /> : <Camera className="size-4" />}
                {preview ? "Retake photo" : "Open camera"}
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
        <h2 className="font-semibold text-slate-950">2. Enter your details</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="text-sm font-medium text-slate-800">Full name *</span><input name="fullName" required maxLength={160} className={inputClass} placeholder="Your full name" /></label>
          <label className="block"><span className="text-sm font-medium text-slate-800">External ID *</span><input name="externalId" required maxLength={128} className={inputClass} placeholder="EMP-001" /></label>
          <label className="block"><span className="text-sm font-medium text-slate-800">Age</span><input name="age" type="number" min={1} max={130} className={inputClass} placeholder="30" /></label>
          <label className="block"><span className="text-sm font-medium text-slate-800">Profession</span><input name="profession" maxLength={160} className={inputClass} placeholder="Designer" /></label>
          <label className="block sm:col-span-2"><span className="text-sm font-medium text-slate-800">Email</span><input name="email" type="email" maxLength={320} className={inputClass} placeholder="you@example.com" /></label>
          <label className="block"><span className="text-sm font-medium text-slate-800">Department</span><input name="department" maxLength={120} className={inputClass} placeholder="Operations" /></label>
          <label className="block"><span className="text-sm font-medium text-slate-800">Role</span><input name="role" maxLength={120} className={inputClass} placeholder="Manager" /></label>
        </div>

        {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
        {phase === "success" && (
          <div className="mt-5 flex gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <span><strong>Registration complete.</strong> {registeredId} can now be recognized by FaceCheck.</span>
          </div>
        )}

        <button type="submit" disabled={!preview || phase === "submitting" || phase === "success"} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50">
          {phase === "submitting" ? <LoaderCircle className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          {phase === "submitting" ? "Registering…" : phase === "success" ? "Registered" : "Register myself"}
        </button>
      </section>
    </form>
  );
}
