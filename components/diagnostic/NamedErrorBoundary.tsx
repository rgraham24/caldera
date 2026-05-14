"use client";

/**
 * TEMPORARY diagnostic error boundary. Wraps a single component so a
 * runtime throw (e.g. the React #310 we're hunting on mobile) is
 * captured, logged with the component's name, and the rest of the
 * layout keeps rendering. Revert this file + its callsites in
 * app/(main)/layout.tsx once the culprit is identified.
 *
 * Logs to console.error with the prefix "[NamedErrorBoundary]" so
 * the iOS Web Inspector console can be filtered. Also emits a hidden
 * <div data-error-boundary={name}> marker for Web Inspector Elements-
 * panel inspection in case the console isn't reachable.
 */

import React from "react";

type Props = {
  name: string;
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export class NamedErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Loud prefix so it's easy to search for in iOS Web Inspector.
    // Logging the message separately AND the error object — Safari's
    // console sometimes truncates one but not the other.
    console.error(
      `[NamedErrorBoundary] ${this.props.name} threw:`,
      error.message,
      error,
      errorInfo
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          data-error-boundary={this.props.name}
          style={{ display: "none" }}
        />
      );
    }
    return this.props.children;
  }
}
