import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import LoginForm from "@/components/LoginForm";

const backgroundImage = "/uchicago-bg.jpg";

export default async function LoginHeroPage() {
  const supabase = await createClient(cookies());
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-cover bg-center relative"
      style={{ backgroundImage: `url('${backgroundImage}')` }}
    >
      <div className="absolute inset-0 bg-black/60 z-0" />
      <div className="relative z-10 flex flex-col items-center w-full max-w-md">
        <div className="mb-8">
          <img src="/logo.svg" alt="Cramwell Logo" className="h-20 md:h-24" />
        </div>
        <LoginForm />
      </div>
    </div>
  );
} 