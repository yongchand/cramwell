"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function LoginForm() {
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
        await supabase.from("users").upsert([
          {
            id: data.user.id,
            email: data.user.email,
            updated_at: new Date().toISOString(),
            last_login: new Date().toISOString(),
          },
        ]);
      }
      router.push("/dashboard");
    }
  };

  return (
    <form
      onSubmit={handleLogin}
      className="bg-white/90 dark:bg-gray-900/90 text-gray-900 dark:text-gray-100 p-8 rounded-xl shadow-lg w-full border border-gray-200 dark:border-gray-800"
    >
      <h2 className="text-xl font-bold mb-6 text-center text-gray-800 dark:text-gray-100">Login to your account</h2>
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
          required
        />
      </div>
      <button
        type="submit"
        className="w-full bg-uchicago-crimson hover:bg-uchicago-maroon text-white py-2 rounded-xl transition-colors"
        disabled={loading}
      >
        {loading ? "Logging in..." : "Login"}
      </button>
      <div className="mt-4 text-center">
        <a href="/auth/signup" className="text-uchicago-crimson hover:text-uchicago-maroon hover:underline">
          Don't have an account? Sign up
        </a>
      </div>
      <div className="mt-2 text-center">
        <a href="/auth/reset" className="text-uchicago-crimson hover:text-uchicago-maroon hover:underline">
          Forgot password?
        </a>
      </div>
    </form>
  );
} 