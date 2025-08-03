"use client";
import { useRouter } from "next/navigation";

export const dynamic = 'force-dynamic';

export default function ResetPage() {
  const router = useRouter();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-cover bg-center relative"
      style={{ backgroundImage: `url('/uchicago-bg.jpg')` }}
    >
      <div className="absolute inset-0 bg-black/60 z-0" />
      <div className="relative z-10 flex flex-col items-center w-full max-w-md">
        <div className="bg-white/90 dark:bg-gray-900/90 text-gray-900 dark:text-gray-100 p-8 rounded-xl shadow-lg w-full border border-gray-200 dark:border-gray-800">
          <h2 className="text-2xl font-bold mb-6 text-center">Password Reset</h2>
          <div className="mb-6 text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Since we use Google OAuth for authentication, password reset is handled through your Google account.
            </p>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              If you're having trouble signing in, please:
            </p>
            <ul className="text-left text-gray-600 dark:text-gray-400 mb-4 space-y-2">
              <li>• Reset your Google account password at <a href="https://accounts.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">accounts.google.com</a></li>
              <li>• Contact your University of Chicago IT support</li>
              <li>• Try signing in again with your updated Google credentials</li>
            </ul>
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