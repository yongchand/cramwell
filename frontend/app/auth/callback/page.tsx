"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export const dynamic = 'force-dynamic';

export default function AuthCallbackPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          setError(error.message);
          setLoading(false);
          return;
        }

        if (data.session?.user) {
          // Check for backroom flag in URL params
          const urlParams = new URLSearchParams(window.location.search);
          const isBackroom = urlParams.get('backroom') === 'true';

          // Check if user has uchicago.edu domain (skip for backroom users)
          const userEmail = data.session.user.email;
          if (!isBackroom && (!userEmail || !userEmail.endsWith('@uchicago.edu'))) {
            setError("Only @uchicago.edu accounts are allowed");
            await supabase.auth.signOut();
            setLoading(false);
            return;
          }

          // Upsert user in users table
          const { error: upsertError } = await supabase.from("users").upsert([
            {
              id: data.session.user.id,
              email: data.session.user.email,
              updated_at: new Date().toISOString(),
              last_login: new Date().toISOString(),
              is_active: true,
            },
          ], {
            onConflict: 'id'
          });

          if (upsertError) {
            console.error("Upsert error:", upsertError);
            setError("User upsert failed: " + upsertError.message);
            setLoading(false);
            return;
          }

          // Redirect to dashboard
          router.push("/dashboard");
        } else {
          // No session, redirect to login
          router.push("/auth/login");
        }
      } catch (err) {
        console.error("Auth callback error:", err);
        setError("Authentication failed");
        setLoading(false);
      }
    };

    handleAuthCallback();
  }, [router, supabase.auth]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-cover bg-center relative"
           style={{ backgroundImage: `url('/uchicago-bg.jpg')` }}>
        <div className="absolute inset-0 bg-black/60 z-0" />
        <div className="relative z-10 flex flex-col items-center">
          <div className="bg-white/90 dark:bg-gray-900/90 text-gray-900 dark:text-gray-100 p-8 rounded-xl shadow-lg">
            <h2 className="text-2xl font-bold mb-4 text-center">Authenticating...</h2>
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-cover bg-center relative"
           style={{ backgroundImage: `url('/uchicago-bg.jpg')` }}>
        <div className="absolute inset-0 bg-black/60 z-0" />
        <div className="relative z-10 flex flex-col items-center">
          <div className="bg-white/90 dark:bg-gray-900/90 text-gray-900 dark:text-gray-100 p-8 rounded-xl shadow-lg">
            <h2 className="text-2xl font-bold mb-4 text-center">Authentication Error</h2>
            <div className="text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-900/40 p-4 rounded mb-4">
              {error}
            </div>
            <button
              onClick={() => router.push("/auth/login")}
              className="w-full bg-blue-600 dark:bg-blue-500 text-white py-2 rounded-xl hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
} 