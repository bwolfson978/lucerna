import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { AuthPage } from "@/components/auth/AuthPage";

export const metadata: Metadata = {
  title: "Sign in | Roth Conversions Optimizer",
  robots: { index: false },
};

export default function SignInPage() {
  return (
    <AuthPage
      title={
        <>
          Sign <em>in.</em>
        </>
      }
    >
      <SignIn />
    </AuthPage>
  );
}
