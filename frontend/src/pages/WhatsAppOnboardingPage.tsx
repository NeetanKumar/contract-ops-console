import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "../context/OrgContext";
import { api, toErrorMessage } from "../api/client";

const META_APP_ID = import.meta.env.VITE_META_APP_ID as string | undefined;
const META_CONFIG_ID = import.meta.env.VITE_META_CONFIG_ID as string | undefined;

declare global {
  interface Window {
    FB?: {
      init: (params: { appId: string; version: string }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        params: { config_id: string; response_type: string; override_default_response_type: boolean },
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

/** Loads Meta's JS SDK once, the same way any Facebook Login / Embedded Signup
 * integration does — a global script tag plus a `fbAsyncInit` callback the SDK calls once
 * ready. Safe to call from multiple mounts; the script only loads once. */
function useFacebookSdk(appId: string | undefined) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!appId) return;
    if (window.FB) {
      setReady(true);
      return;
    }

    window.fbAsyncInit = () => {
      window.FB!.init({ appId, version: "v21.0" });
      setReady(true);
    };

    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, [appId]);

  return ready;
}

export function WhatsAppOnboardingPage() {
  const { selectedOrgId } = useOrg();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const sdkReady = useFacebookSdk(META_APP_ID);

  const connectionQuery = useQuery({
    queryKey: ["whatsapp-connection", selectedOrgId],
    queryFn: () => api.getWhatsAppConnection(selectedOrgId!),
    enabled: !!selectedOrgId,
  });

  const completeMutation = useMutation({
    mutationFn: (body: { code: string; wabaId: string; phoneNumberId: string; displayPhoneNumber: string }) =>
      api.completeEmbeddedSignup(selectedOrgId!, body),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-connection", selectedOrgId] });
    },
    onError: (err) => setError(toErrorMessage(err, "Failed to complete WhatsApp connection")),
  });

  // FB.login's callback and the WA_EMBEDDED_SIGNUP postMessage event can arrive in either
  // order — this ref lets whichever piece of data arrives first wait for the other, and
  // (unlike a plain local variable) stays the same object across re-renders so the message
  // listener and connect()'s FB.login callback always see each other's writes.
  const pendingSignupRef = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  // Meta posts a `WA_EMBEDDED_SIGNUP` message to the window once the signup popup
  // finishes, carrying the WABA id and phone number id chosen during the flow. FB.login's
  // own callback separately hands back the short-lived `code` used to exchange for a
  // token — both are needed before we can call the backend.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      let data: { type?: string; event?: string; data?: { waba_id?: string; phone_number_id?: string } };
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type !== "WA_EMBEDDED_SIGNUP" || data.event !== "FINISH") return;

      const wabaId = data.data?.waba_id;
      const phoneNumberId = data.data?.phone_number_id;
      if (wabaId && phoneNumberId) {
        pendingSignupRef.current.wabaId = wabaId;
        pendingSignupRef.current.phoneNumberId = phoneNumberId;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function connect() {
    if (!window.FB || !META_CONFIG_ID) return;
    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setError("WhatsApp connection was cancelled or did not return a code.");
          return;
        }
        const { wabaId, phoneNumberId } = pendingSignupRef.current;
        if (!wabaId || !phoneNumberId) {
          setError("Didn't receive WABA/phone details from Meta — please try again.");
          return;
        }
        completeMutation.mutate({ code, wabaId, phoneNumberId, displayPhoneNumber: phoneNumberId });
      },
      { config_id: META_CONFIG_ID, response_type: "code", override_default_response_type: true },
    );
  }

  const connection = connectionQuery.data;
  const missingConfig = !META_APP_ID || !META_CONFIG_ID;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-gray-800 dark:text-gray-100">
          Connect your WhatsApp Business number
        </h1>
        <Link to="/whatsapp-setup" className="text-xs text-indigo-500 hover:underline">
          Use the dev/test number instead →
        </Link>
      </div>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Connect your own real WhatsApp Business number via Meta's Embedded Signup, keeping your
        existing WhatsApp Business App working side-by-side (Coexistence). Once connected, every
        conversation with a counterparty — both what they send you and what you reply with through
        the app — is automatically paired into one negotiation, with no manual setup per deal.
      </p>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800">
        {missingConfig && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            Missing <code>VITE_META_APP_ID</code> / <code>VITE_META_CONFIG_ID</code> on the frontend.
            Create an Embedded Signup configuration under Meta's WhatsApp product dashboard to get a
            config ID, then set these and restart the frontend.
          </div>
        )}

        {connection?.connected ? (
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              Connected
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-400">{connection.displayPhoneNumber}</span>
          </div>
        ) : (
          <button
            onClick={connect}
            disabled={!selectedOrgId || !sdkReady || missingConfig || completeMutation.isPending}
            className="rounded-md bg-indigo-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-600 disabled:opacity-40"
          >
            {completeMutation.isPending ? "Connecting…" : "Connect WhatsApp Business number"}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
