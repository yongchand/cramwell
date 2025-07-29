"use client";
import { useState } from "react";

export const dynamic = 'force-dynamic';
import { createClient } from "@/utils/supabase/client";

export default function ResetPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-cover bg-center relative"
      style={{ backgroundImage: `url('/uchicago-bg.jpg')` }}
    >
      <div className="absolute inset-0 bg-black/60 z-0" />
      <div className="relative z-10 flex flex-col items-center w-full max-w-md">
                <form
          onSubmit={handleReset}
          className="bg-white/90 dark:bg-gray-900/90 text-gray-900 dark:text-gray-100 p-8 rounded-xl shadow-lg w-full border border-gray-200 dark:border-gray-800"
        >
          <h2 className="text-2xl font-bold mb-6 text-center">Reset Password</h2>
          {error && (
            <div className="mb-4 text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-900/40 p-2 rounded">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40 p-2 rounded">
              Check your email for password reset instructions!
            </div>
          )}
          <div className="mb-4">
            <label className="block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 dark:bg-blue-500 text-white py-2 rounded-xl hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
            disabled={loading}
          >
            {loading ? "Sending..." : "Send Reset Email"}
          </button>
          <div className="mt-4 text-center">
            <a href="/auth/login" className="text-blue-600 dark:text-blue-400 hover:underline">
              Back to Login
            </a>
          </div>
        </form>
      </div>
    </div>
  );
} 