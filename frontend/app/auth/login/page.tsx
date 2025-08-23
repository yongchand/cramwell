"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCodePrompt, setShowCodePrompt] = useState(false);
  const [enteredCode, setEnteredCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleGoogleLogin = async (isBackroom = false) => {
    setLoading(true);
    setError("");
    
    const queryParams: { [key: string]: string } = {};
    
    if (!isBackroom) {
      queryParams.hd = 'uchicago.edu';
    }
    
    const redirectUrl = `${window.location.origin}/auth/callback${isBackroom ? '?backroom=true' : ''}`;
    
    const authOptions = {
      provider: 'google' as const,
      options: {
        redirectTo: redirectUrl,
        queryParams
      }
    };
    
    const { data, error } = await supabase.auth.signInWithOAuth(authOptions);
    
    if (error) {
      setLoading(false);
      setError(error.message);
    }
    // Note: The redirect will happen automatically, so we don't need to handle success here
  };

  const handleBackroomClick = () => {
    setShowCodePrompt(true);
    setCodeError("");
  };

  const handleCodeSubmit = () => {
    if (enteredCode === "edwardroom") {
      setShowCodePrompt(false);
      setEnteredCode("");
      setCodeError("");
      handleGoogleLogin(true); // Call with backroom mode enabled
    } else {
      setCodeError("Invalid code");
      setEnteredCode("");
    }
  };

  const handleCodeCancel = () => {
    setShowCodePrompt(false);
    setEnteredCode("");
    setCodeError("");
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-cover bg-center relative"
      style={{ backgroundImage: `url('/uchicago-bg.jpg')` }}
    >
      <div className="absolute inset-0 bg-black/60 z-0" />
      <div className="relative z-10 flex flex-col items-center w-full max-w-md px-4">
        <div className="mb-8">
          <img src="/Cramwell_Logo_Icon_Name.png" alt="Cramwell Logo" className="h-32 md:h-40 lg:h-48" />
        </div>
        <div className="bg-white/90 dark:bg-gray-900/90 text-gray-900 dark:text-gray-100 p-8 rounded-xl shadow-lg w-full border border-gray-200 dark:border-gray-800">
          <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>
          {error && (
            <div className="mb-4 text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-900/40 p-2 rounded">
              {error}
            </div>
          )}
          
          {showCodePrompt ? (
            <div className="mb-6">
              <p className="text-center text-gray-600 dark:text-gray-400 mb-4">
                Enter access code:
              </p>
              {codeError && (
                <div className="mb-4 text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-900/40 p-2 rounded text-center">
                  {codeError}
                </div>
              )}
              <input
                type="password"
                value={enteredCode}
                onChange={(e) => setEnteredCode(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl mb-4 text-gray-900"
                placeholder="Enter code"
                onKeyPress={(e) => e.key === 'Enter' && handleCodeSubmit()}
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={handleCodeSubmit}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-xl transition-colors"
                >
                  Submit
                </button>
                <button
                  onClick={handleCodeCancel}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-6">
              <p className="text-center text-gray-600 dark:text-gray-400 mb-4">
                Sign in with your University of Chicago Google account
              </p>
              <button
                onClick={() => handleGoogleLogin(false)}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 px-4 border border-gray-300 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  "Signing in..."
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Sign in with Google
                  </>
                )}
              </button>
            </div>
          )}
          
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            <p>Only @uchicago.edu accounts are allowed</p>
          </div>
          <div className="mt-4 text-center">
            <a href="/auth/signup" className="text-blue-600 dark:text-blue-400 hover:underline">
              Don't have an account? Sign up
            </a>
          </div>
          
          {/* Backroom button */}
          {!showCodePrompt && (
            <div className="mt-6 text-center">
              <button
                onClick={handleBackroomClick}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                backroom
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 