interface AppErrorProps {
  error: Error;
  onRetry: () => void;
}

export function AppError({ error, onRetry }: AppErrorProps) {
  return (
    <div className="app app--error" data-testid="app-error">
      <h1>Could not load the corpus</h1>
      <p>{error.message}</p>
      <button onClick={onRetry} data-testid="app-error-retry">Retry</button>
    </div>
  );
}
