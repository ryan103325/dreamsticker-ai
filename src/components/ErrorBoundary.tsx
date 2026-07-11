import React, { Component, ErrorInfo, ReactNode } from "react";
import { captureError } from "../services/errorReporting";

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        // React render errors never reach window.onerror — forward manually
        captureError(error, { componentStack: errorInfo.componentStack });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: "50px", textAlign: "center", fontFamily: "sans-serif" }}>
                    <h1 style={{ fontSize: "2rem", color: "#EF4444", marginBottom: "20px" }}>Something went wrong.</h1>
                    <p style={{ color: "#4B5563", marginBottom: "20px" }}>很抱歉，應用程式發生錯誤。</p>
                    <pre style={{
                        textAlign: "left",
                        backgroundColor: "#F3F4F6",
                        padding: "20px",
                        borderRadius: "10px",
                        overflow: "auto",
                        maxWidth: "800px",
                        margin: "0 auto",
                        color: "#DC2626",
                        fontSize: "12px"
                    }}>
                        {this.state.error?.toString()}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: "20px",
                            padding: "10px 20px",
                            backgroundColor: "#4F46E5",
                            color: "white",
                            border: "none",
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontWeight: "bold"
                        }}
                    >
                        重整頁面
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
