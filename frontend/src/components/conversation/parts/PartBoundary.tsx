"use client";

import { Component, type ReactNode } from "react";
import posthog from "posthog-js";

/**
 * Keeps one conversation card's render error from taking down the page: the card is
 * replaced with a short notice and the error is reported. Cards render data from the
 * server and from saved conversations, which can be a version apart from this code.
 */
export class PartBoundary extends Component<
  { kind: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    posthog.capture("conversation_part_error", {
      kind: this.props.kind,
      message: error.message,
    });
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="card text-body-sm text-text-tertiary" role="status">
          This part of the conversation couldn&apos;t be shown. The rest of the analysis is
          unaffected.
        </div>
      );
    }
    return this.props.children;
  }
}
