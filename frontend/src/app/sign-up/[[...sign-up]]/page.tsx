import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { AuthPage } from "@/components/auth/AuthPage";

export const metadata: Metadata = {
  title: "Create an account | Roth Conversions Optimizer",
  robots: { index: false },
};

export default function SignUpPage() {
  return (
    <AuthPage
      title={
        <>
          Create an <em>account.</em>
        </>
      }
    >
      <SignUp />
    </AuthPage>
  );
}
