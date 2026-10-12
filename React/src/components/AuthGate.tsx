import { type ReactNode, useEffect, useState } from "react";
import BeginningReloader from "@/components/Beginningreloader";

export function AuthGate({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);

  const handleLoadingComplete = () => {
    setIsLoading(false);
  };

  return (
    <>
      {isLoading ? (
        <BeginningReloader onComplete={handleLoadingComplete} duration={3500} />
      ) : (
        children
      )}
    </>
  );
}
