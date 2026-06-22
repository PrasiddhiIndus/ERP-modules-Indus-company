import React from "react";

function isChunkLoadError(error) {
  const message = String(error?.message || error || "");
  return (
    error?.name === "ChunkLoadError" ||
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Loading chunk") ||
    message.includes("Importing a module script failed")
  );
}

export default class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error("Route render failed:", error);
  }

  handleRetry = () => {
    const { error } = this.state;
    if (isChunkLoadError(error)) {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunkError = isChunkLoadError(error);

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4 text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          {chunkError ? "Page update required" : "Something went wrong"}
        </h1>
        <p className="text-sm text-gray-600 max-w-md mb-4">
          {chunkError
            ? "This page could not load its module. This often happens after a new release — reload to fetch the latest version."
            : error?.message || "An unexpected error occurred while loading this page."}
        </p>
        <button
          type="button"
          onClick={this.handleRetry}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium"
        >
          {chunkError ? "Reload page" : "Try again"}
        </button>
      </div>
    );
  }
}
