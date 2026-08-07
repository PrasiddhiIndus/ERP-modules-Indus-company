import React from "react";
import { forceAppRefreshOnce, isChunkLoadError } from "../lib/lazyWithRetry";

export default class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, refreshing: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error("Route render failed:", error);
    if (isChunkLoadError(error)) {
      this.setState({ refreshing: true });
      void forceAppRefreshOnce().then((didRefresh) => {
        if (!didRefresh) {
          this.setState({ refreshing: false });
        }
      });
    }
  }

  handleRetry = () => {
    const { error } = this.state;
    if (isChunkLoadError(error)) {
      this.setState({ refreshing: true });
      void forceAppRefreshOnce().then((didRefresh) => {
        if (!didRefresh) {
          // Cooldown active — force a normal reload anyway
          window.location.reload();
        }
      });
      return;
    }
    this.setState({ error: null, refreshing: false });
  };

  render() {
    const { error, refreshing } = this.state;
    if (!error) return this.props.children;

    const chunkError = isChunkLoadError(error);

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4 text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          {chunkError ? "Updating app…" : "Something went wrong"}
        </h1>
        <p className="text-sm text-gray-600 max-w-md mb-4">
          {chunkError
            ? refreshing
              ? "A newer version is available. Reloading automatically…"
              : "A newer version of the app is available. Reload to continue."
            : error?.message || "An unexpected error occurred while loading this page."}
        </p>
        <button
          type="button"
          onClick={this.handleRetry}
          className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-deep text-sm font-medium"
        >
          {chunkError ? "Reload now" : "Try again"}
        </button>
      </div>
    );
  }
}
