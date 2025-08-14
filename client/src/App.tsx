import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import ProjectPage from "@/pages/project-fixed-minimal";
import { ImportPage } from "@/pages/import";
import ProjectDashboard from "@/pages/project-dashboard";

import DebugPages from "@/pages/debug-pages-new";
import DraftReview from "@/pages/draft-review";
import GenerateLinks from "@/pages/generate-links";
import { useAuth } from "@/hooks/useAuth";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <svg className="animate-spin -ml-1 mr-3 h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-gray-600">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      {isAuthenticated ? (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/project/:id" component={ProjectDashboard} />
          <Route path="/project/:id/upload" component={ProjectPage} />
          <Route path="/project/:id/seo" component={ProjectPage} />
          <Route path="/project/:id/import" component={ImportPage} />
          <Route path="/project/:id/import-progress" component={ProjectPage} />
          <Route path="/project/:id/scope" component={ProjectPage} />
          <Route path="/project/:id/generate" component={ProjectPage} />
          <Route path="/project/:id/draft" component={ProjectPage} />
          <Route path="/project/:id/publish" component={ProjectPage} />
          <Route path="/project/:id/draft/:runId" component={DraftReview} />
          <Route path="/project/:id/debug" component={DebugPages} />
        </>
      ) : (
        <>
          <Route path="/" component={AuthPage} />
          <Route path="/auth" component={AuthPage} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
