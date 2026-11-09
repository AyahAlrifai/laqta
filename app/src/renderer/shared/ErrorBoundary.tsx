import { Component, type ReactNode } from 'react';

interface Props {
  message: string;
  children: ReactNode;
}

/** A crash in a page shows a readable message (role alert) instead of a blank window. */
export default class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <p role="alert" style={{ padding: 24, margin: 0 }}>
          {this.props.message}
        </p>
      );
    }
    return this.props.children;
  }
}
