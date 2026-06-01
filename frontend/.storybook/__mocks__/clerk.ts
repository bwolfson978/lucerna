import React from "react";

// Minimal Clerk mock for Storybook — keeps stories independent of real Clerk context.

export const useUser = () => ({
  user: null,
  isLoaded: true,
  isSignedIn: false,
});

export const useAuth = () => ({
  isLoaded: true,
  isSignedIn: false,
  userId: null,
});

export const SignInButton = ({ children }: { children: React.ReactNode; mode?: string }) =>
  React.createElement(React.Fragment, null, children);

export const ClerkProvider = ({ children }: { children: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);
