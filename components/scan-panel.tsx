"use client";

/* The preview is a transient browser Blob URL, which Next/Image cannot optimize. */
/* eslint-disable @next/next/no-img-element */

import {
  Camera,
  CameraOff,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
  ScanFace,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type FaceMatchUser = {
  externalId: string;
  fullName: string;
  age?: string | null;
  profession?: string | null;
  email?: string | null;
  department?: string | null;
  role?: string | null;
};

type ScanPhase = "idle" | "camera" | "capturing" | "scanning" | "matched" | "no-match" | "error";

type ScanPanelProps = {
  className?: string;
  /** Called after the API positively identifies a person. */
  onMatch?: (user: FaceMatchUser) => void;
};

const noMatchMessages: Record<string, string> = {
  ambiguous: "More than one possible match was found. Please try again with only one face in view.",
  multiple_faces: "We detected more than one face. Make sure only one person is in the camera frame and try again.",
  no_face: "We could not find a face in that image. Center your face in the frame and try again.",
  no_match: "This face is not in the directory.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Camera access was blocked. Allow camera access in your browser and try again.";
    }
    if (error.name === "NotFoundError") {
      return "No camera was found on this device.";
    }
    if (error.name === "NotReadableError") {
      return "Your camera is being used by another application. Close it and try again.";
    }
  }

  return error instanceof Error ? error.message : "We could not start the camera. Please try again.";
}

function asMatchedUser(value: unknown): FaceMatchUser | null {
  if (!isRecord(value)) return null;

  const externalId = getString(value.externalId);
  const fullName = getString(value.fullName);

  if (!externalId || !fullName) return null;

  return {
    externalId,
    fullName,
    age: getString(value.age) ?? null,
    profession: getString(value.profession) ?? null,
    email: getString(value.email) ?? null,
    department: getString(value.department) ?? null,
    role: getString(value.role) ?? null,
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * A privacy-conscious face scan panel. It only keeps a captured JPEG locally
 * while the request is in progress and closes the camera after capture.
 */
export function ScanPanel({ className, onMatch }: ScanPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const cameraRequestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const descriptionId = useId();

  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [matchedUser, setMatchedUser] = useState<FaceMatchUser | null>(null);
  const [noMatchReason, setNoMatchReason] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    const stream = streamRef.current;

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }, []);

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setCapturedPreview(null);
  }, []);

  const clearResultState = useCallback(() => {
    setMatchedUser(null);
    setNoMatchReason(null);
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      cameraRequestIdRef.current += 1;
      abortRef.current?.abort();
      stopCamera();

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    const requestId = cameraRequestIdRef.current + 1;
    cameraRequestIdRef.current = requestId;

    abortRef.current?.abort();
    abortRef.current = null;
    stopCamera();
    clearPreview();
    clearResultState();
    setPhase("capturing");

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("This browser does not support camera access.");
      setPhase("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      // A user may have clicked retry while permission was being granted.
      if (!mountedRef.current || requestId !== cameraRequestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;

      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // The element is muted and playsInline, so this is uncommon. The
        // stream remains usable if a browser declines an explicit play call.
      }

      if (mountedRef.current && requestId === cameraRequestIdRef.current) {
        setPhase("camera");
      }
    } catch (error) {
      if (!mountedRef.current || requestId !== cameraRequestIdRef.current) return;

      setErrorMessage(getErrorMessage(error));
      setPhase("error");
    }
  }, [clearPreview, clearResultState, stopCamera]);

  const captureAndScan = useCallback(async () => {
    const video = videoRef.current;

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setErrorMessage("The camera is still getting ready. Please wait a moment and try again.");
      setPhase("error");
      stopCamera();
      return;
    }

    setPhase("capturing");
    setErrorMessage(null);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");

    if (!context) {
      setErrorMessage("Your browser could not prepare the camera image.");
      setPhase("error");
      stopCamera();
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const jpeg = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.9);
    });

    if (!jpeg) {
      setErrorMessage("We could not capture a photo. Please try again.");
      setPhase("error");
      stopCamera();
      return;
    }

    clearPreview();
    const previewUrl = URL.createObjectURL(jpeg);
    previewUrlRef.current = previewUrl;
    setCapturedPreview(previewUrl);
    stopCamera();
    setPhase("scanning");

    const controller = new AbortController();
    abortRef.current = controller;
    const formData = new FormData();
    formData.append("image", new File([jpeg], "face-scan.jpg", { type: "image/jpeg" }));

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const payload = await readJson(response);

      if (!mountedRef.current || controller.signal.aborted) return;

      const data = isRecord(payload) ? payload : {};
      const user = asMatchedUser(data.user);

      if (response.ok && data.matched === true && user) {
        setMatchedUser(user);
        setPhase("matched");
        onMatch?.(user);
        return;
      }

      if (data.matched === false || response.status === 404) {
        setNoMatchReason(getString(data.reason) ?? "no_match");
        setPhase("no-match");
        return;
      }

      const apiMessage = getString(data.error);
      throw new Error(apiMessage ?? "We could not complete the face scan. Please try again.");
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted) return;

      setErrorMessage(
        error instanceof Error ? error.message : "We could not complete the face scan. Please try again.",
      );
      setPhase("error");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [clearPreview, onMatch, stopCamera]);

  const closeCamera = useCallback(() => {
    cameraRequestIdRef.current += 1;
    stopCamera();
    setPhase("idle");
  }, [stopCamera]);

  const isLoading = phase === "capturing" || phase === "scanning";
  // Keep the video element mounted while getUserMedia is resolving, otherwise
  // there would be no element to attach the newly granted stream to.
  const hasCamera = phase === "camera" || phase === "capturing";
  const noMatchText = noMatchMessages[noMatchReason ?? ""] ?? noMatchMessages.no_match;

  return (
    <section
      aria-busy={isLoading}
      aria-labelledby="face-scan-heading"
      className={cn(
        "w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]",
        className,
      )}
    >
      <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
            <ScanFace className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="face-scan-heading" className="text-lg font-semibold tracking-tight text-slate-950">
              Face check
            </h2>
            <p id={descriptionId} className="mt-1 text-sm leading-5 text-slate-500">
              Center your face in the frame. We capture one image to check the directory.
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-7">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-950 sm:aspect-video">
          {hasCamera ? (
            <>
              <video
                ref={videoRef}
                aria-describedby={descriptionId}
                aria-label="Live camera preview"
                autoPlay
                className="size-full object-cover"
                muted
                playsInline
              />
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="h-[70%] w-[46%] rounded-[46%] border-2 border-white/90 shadow-[0_0_0_999px_rgba(15,23,42,0.22)]" />
              </div>
              <p className="absolute inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-slate-950/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
                Keep your face inside the guide
              </p>
              {phase === "capturing" && !capturedPreview && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/45 text-center text-white backdrop-blur-[1px]">
                  <LoaderCircle className="size-8 animate-spin" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold">Opening your camera…</p>
                </div>
              )}
            </>
          ) : capturedPreview ? (
            <img alt="Captured face scan" className="size-full object-cover" src={capturedPreview} />
          ) : (
            <div className="flex size-full flex-col items-center justify-center px-6 text-center text-slate-300">
              {phase === "error" ? (
                <CameraOff className="mb-3 size-9" aria-hidden="true" />
              ) : (
                <Camera className="mb-3 size-9" aria-hidden="true" />
              )}
              <p className="text-sm font-medium text-white">
                Your camera preview will appear here
              </p>
              <p className="mt-1 text-xs text-slate-400">Camera access is requested only when you start a scan.</p>
            </div>
          )}

          {phase === "scanning" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 text-center text-white backdrop-blur-sm">
              <LoaderCircle className="size-9 animate-spin" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold">Checking the directory…</p>
              <p className="mt-1 text-xs text-slate-200">This usually takes a moment.</p>
            </div>
          )}
        </div>

        <div className="mt-5 min-h-16" aria-live="polite" aria-atomic="true">
          {phase === "matched" && matchedUser && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-semibold">Match found</p>
                  <p className="mt-0.5 text-sm text-emerald-800">{matchedUser.fullName}</p>
                  <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-emerald-900 sm:grid-cols-2">
                    <div>
                      <dt className="sr-only">Directory ID</dt>
                      <dd>ID: {matchedUser.externalId}</dd>
                    </div>
                    {matchedUser.age && (
                      <div>
                        <dt className="sr-only">Age</dt>
                        <dd>Age: {matchedUser.age}</dd>
                      </div>
                    )}
                    {matchedUser.profession && (
                      <div>
                        <dt className="sr-only">Profession</dt>
                        <dd>{matchedUser.profession}</dd>
                      </div>
                    )}
                    {matchedUser.department && (
                      <div>
                        <dt className="sr-only">Department</dt>
                        <dd>{matchedUser.department}</dd>
                      </div>
                    )}
                    {matchedUser.role && (
                      <div>
                        <dt className="sr-only">Role</dt>
                        <dd>{matchedUser.role}</dd>
                      </div>
                    )}
                    {matchedUser.email && (
                      <div className="truncate">
                        <dt className="sr-only">Email</dt>
                        <dd title={matchedUser.email}>{matchedUser.email}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            </div>
          )}

          {phase === "no-match" && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <div className="flex gap-3">
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
                <div>
                  <p className="font-semibold">No confirmed match</p>
                  <p className="mt-0.5 text-sm leading-5 text-amber-900">{noMatchText}</p>
                </div>
              </div>
            </div>
          )}

          {phase === "error" && errorMessage && (
            <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-950">
              <div className="flex gap-3">
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-rose-600" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Unable to scan</p>
                  <p className="mt-0.5 text-sm leading-5 text-rose-900">{errorMessage}</p>
                </div>
              </div>
            </div>
          )}

          {phase === "idle" && (
            <p className="pt-1 text-sm leading-5 text-slate-500">
              Use a well-lit space and remove anything covering your face for the most reliable result.
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          {hasCamera ? (
            <>
              <button
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoading}
                onClick={() => void captureAndScan()}
                type="button"
              >
                <ScanFace className="size-4" aria-hidden="true" />
                Capture and check
              </button>
              <button
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                onClick={closeCamera}
                type="button"
              >
                Close camera
              </button>
            </>
          ) : (
            <button
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading}
              onClick={() => void startCamera()}
              type="button"
            >
              {isLoading ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : phase === "idle" ? (
                <Camera className="size-4" aria-hidden="true" />
              ) : (
                <RefreshCw className="size-4" aria-hidden="true" />
              )}
              {phase === "idle" ? "Start camera" : "Try another scan"}
            </button>
          )}
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
          <UserRound className="size-3.5" aria-hidden="true" />
          <span>The camera turns off automatically after each capture.</span>
        </div>
      </div>
    </section>
  );
}

export default ScanPanel;
