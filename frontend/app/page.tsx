import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-white via-blue-50 to-indigo-100 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
        <div className="absolute top-40 left-40 w-80 h-80 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
      </div>
      
      {/* Hero Section */}
      <section className="flex-1 flex flex-col justify-center items-center py-24 px-4 relative z-10">
        <div className="max-w-6xl w-full text-center">
          <div className="flex justify-center mb-6">
            <img src="/Cramwell_Logo_Icon.png" alt="Cramwell Logo" className="h-24 w-24" />
          </div>
          <h1 className="text-5xl font-extrabold mb-4 tracking-tight text-gray-900">
            Cramwell AI
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Better AI for College
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
            <Link href="/auth/login">
              <button className="px-8 py-3 rounded-lg bg-black text-white font-semibold text-lg shadow-lg hover:bg-gray-900 transition transform hover:scale-105">
                Sign In
              </button>
            </Link>
            <Link href="/auth/signup">
              <button className="px-8 py-3 rounded-lg bg-white border border-gray-300 text-gray-900 font-semibold text-lg shadow-lg hover:bg-gray-100 transition transform hover:scale-105">
                Get Started
              </button>
            </Link>
          </div>
          {/* Features grid - hidden on mobile, visible on desktop */}
          <div className="hidden md:grid grid-cols-1 md:grid-cols-3 gap-8 mt-12 max-w-5xl mx-auto">
            <div className="flex flex-col items-center bg-white/60 backdrop-blur-sm rounded-xl p-8 shadow-lg min-h-[200px] justify-center">
              <span className="text-2xl font-bold text-gray-800 mb-4">Chat with AI</span>
              <span className="text-gray-500 text-center">Talk with an AI chatbot that actually knows your material</span>
            </div>
            <div className="flex flex-col items-center bg-white/60 backdrop-blur-sm rounded-xl p-8 shadow-lg min-h-[200px] justify-center">
              <span className="text-2xl font-bold text-gray-800 mb-4">Study Guides</span>
              <span className="text-gray-500 text-center">Practice with AI-generated study guides based on your actual materials</span>
            </div>
            <div className="flex flex-col items-center bg-white/60 backdrop-blur-sm rounded-xl p-8 shadow-lg min-h-[200px] justify-center">
              <span className="text-2xl font-bold text-gray-800 mb-4">Course Summary</span>
              <span className="text-gray-500 text-center">Get comprehensive course summaries and key insights</span>
            </div>
          </div>
          {/* Support note */}
          <div className="mt-10 text-center">
            <p className="text-base text-gray-700 font-medium">
              Currently supported for <span className="font-semibold">University of Chicago</span> students only.<br />
              Want Cramwell AI at your school? Contact <a href="mailto:support@cramwell.ai" className="text-blue-600 underline">support@cramwell.ai</a>.
            </p>
          </div>
        </div>
      </section>
      
      {/* Mobile-only Features Section */}
      <section className="block md:hidden py-16 px-4 relative z-10 bg-white/80">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 gap-8">
            <div className="flex flex-col items-center bg-white/60 backdrop-blur-sm rounded-xl p-8 shadow-lg min-h-[200px] justify-center">
              <span className="text-2xl font-bold text-gray-800 mb-4">Chat with AI</span>
              <span className="text-gray-500 text-center">Talk with an AI chatbot that actually knows your material</span>
            </div>
            <div className="flex flex-col items-center bg-white/60 backdrop-blur-sm rounded-xl p-8 shadow-lg min-h-[200px] justify-center">
              <span className="text-2xl font-bold text-gray-800 mb-4">Study Guides</span>
              <span className="text-gray-500 text-center">Practice with AI-generated study guides based on your actual materials</span>
            </div>
            <div className="flex flex-col items-center bg-white/60 backdrop-blur-sm rounded-xl p-8 shadow-lg min-h-[200px] justify-center">
              <span className="text-2xl font-bold text-gray-800 mb-4">Course Summary</span>
              <span className="text-gray-500 text-center">Get comprehensive course summaries and key insights</span>
            </div>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 bg-white/80 mt-8 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center space-x-2">
            <img src="/Cramwell_Logo_Icon.png" alt="Cramwell AI" className="h-6 w-6" />
            <span className="text-gray-700 font-semibold">Cramwell</span>
          </div>
          <div className="text-gray-500 text-sm mt-4 md:mt-0">
            &copy; {new Date().getFullYear()} Cramwell AI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
} 