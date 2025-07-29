"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      // Upsert user in users table (update last_login)
      if (data.user) {
        const { error: upsertError } = await supabase.from("users").upsert([
          {
            id: data.user.id,
            email: data.user.email,
            updated_at: new Date().toISOString(),
            last_login: new Date().toISOString(),
          },
        ]);
        if (upsertError) {
          console.error("Upsert error:", upsertError);
          setError("User upsert failed: " + upsertError.message);
        }
      }
      router.push("/");
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
          onSubmit={handleLogin}
          className="bg-white/90 dark:bg-gray-900/90 text-gray-900 dark:text-gray-100 p-8 rounded-xl shadow-lg w-full border border-gray-200 dark:border-gray-800"
        >
        <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>
        {error && (
          <div className="mb-4 text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-900/40 p-2 rounded">
            {error}
          </div>
        )}
                  <div className="mb-4">
            <label className="block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="email"
              required
            />
          </div>
                  <div className="mb-6">
            <label className="block mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="current-password"
              required
            />
          </div>
        <button
          type="submit"
          className="w-full bg-blue-600 dark:bg-blue-500 text-white py-2 rounded-xl hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
          disabled={loading}
        >
          {loading ? "Logging in..." : "Login"}
        </button>
        <div className="mt-4 text-center">
          <a href="/auth/signup" className="text-blue-600 dark:text-blue-400 hover:underline">
            Don't have an account? Sign up
          </a>
        </div>
        <div className="mt-2 text-center">
          <a href="/auth/reset" className="text-blue-600 dark:text-blue-400 hover:underline">
            Forgot password?
          </a>
        </div>
              </form>
      </div>
    </div>
  );
} 