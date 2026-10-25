"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import {
  SignInButton,
  useAccountProfile,
  useAuth,
  useDeleteClerkUser,
  useOpenUserProfile,
  useUser,
} from "@/lib/auth";
import { Header } from "@/components/common/Header";
import { GlowButton } from "@/components/common/GlowButton";
import { SignInRequired } from "@/components/common/SignInRequired";
import { PageFooter } from "@/components/common/PageFooter";
import { AccountSettings } from "@/components/account/AccountSettings";
import { AccountDeleted } from "@/components/account/AccountDeleted";
import { createScenariosApi } from "@/lib/api/scenarios";
import { downloadScenariosCsv } from "@/lib/scenario/csv";
import type { SavedScenario } from "@/lib/types";

export default function AccountPage() {
  const { isLoaded, isSignedIn } = useUser();
  const profile = useAccountProfile();
  const { getToken } = useAuth();
  const deleteClerkUser = useDeleteClerkUser();
  const openUserProfile = useOpenUserProfile();
  const [scenarios, setScenarios] = useState<SavedScenario[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Set once the account is gone: Clerk signs the person out, and this keeps the
  // confirmation on screen instead of the signed-out prompt.
  const [deleted, setDeleted] = useState<{ count: number | null } | null>(null);
  // Deleting the Clerk user signs out before the delete call returns; keep the settings
  // (and the dialog's progress) on screen until we know how it went.
  const [deleting, setDeleting] = useState(false);
  const lastProfile = useRef(profile);
  if (profile) lastProfile.current = profile;

  const fetchScenarios = useCallback(async () => {
    setLoadFailed(false);
    try {
      setScenarios(await createScenariosApi(getToken).list());
    } catch {
      setLoadFailed(true);
    }
  }, [getToken]);

  useEffect(() => {
    if (isLoaded && isSignedIn) fetchScenarios();
  }, [isLoaded, isSignedIn, fetchScenarios]);

  // Saved scenarios first: once the Clerk user is gone there's no token to delete them with.
  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const { deleted_scenarios } = await createScenariosApi(getToken).deleteAccountData();
      await deleteClerkUser();
      posthog.reset();
      setDeleted({ count: deleted_scenarios ?? null });
      window.scrollTo({ top: 0 });
    } finally {
      setDeleting(false);
    }
  }, [getToken, deleteClerkUser]);

  if (!isLoaded) return null;

  const newest = scenarios?.reduce<string | null>(
    (latest, s) => (latest === null || s.updated_at > latest ? s.updated_at : latest),
    null
  );

  return (
    <>
      <Header />
      <main className="px-default py-section-lg md:px-page">
        <div className="mx-auto flex max-w-content flex-col gap-section">
          {deleted ? (
            <AccountDeleted scenarioCount={deleted.count} />
          ) : (isSignedIn || deleting) && lastProfile.current ? (
            <AccountSettings
              profile={lastProfile.current}
              data={{
                count: scenarios?.length ?? null,
                lastSaved: newest ?? null,
                failed: loadFailed,
              }}
              onManageSignIn={openUserProfile}
              onDownload={scenarios?.length ? () => downloadScenariosCsv(scenarios) : undefined}
              onRetryData={fetchScenarios}
              onDelete={handleDelete}
            />
          ) : (
            <SignInRequired
              title="Sign in to manage your account"
              description="Account settings are for people with a free account. Signing in is only needed to save."
              signInButton={
                <SignInButton>
                  <GlowButton size="sm">Sign in</GlowButton>
                </SignInButton>
              }
            />
          )}
        </div>
      </main>
      <PageFooter />
    </>
  );
}
