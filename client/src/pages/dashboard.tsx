import { Shield, User, Clock, FolderSync, UserCheck, RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function Dashboard() {
  const { user } = useAuth();
  const logoutMutation = useLogout();
  const { toast } = useToast();

  const testAuthMe = async () => {
    try {
      const response = await apiRequest("GET", "/auth/me");
      const userData = await response.json();
      toast({
        title: "API Test Successful",
        description: `Retrieved user data: ${userData.email}`,
      });
    } catch (error) {
      toast({
        title: "API Test Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const refreshToken = async () => {
    try {
      // The token refresh is handled automatically by the auth middleware
      // This just makes a request to trigger the refresh if needed
      await apiRequest("GET", "/auth/me");
      toast({
        title: "Token Refresh",
        description: "Tokens refreshed successfully",
      });
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mr-4">
                <User className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">SecureAuth Dashboard</h1>
                <p className="text-gray-600">Welcome back, {user.email}</p>
              </div>
            </div>
            <Button 
              variant="outline"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="flex items-center"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {logoutMutation.isPending ? "Signing out..." : "Sign out"}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Welcome Section */}
          <div className="lg:col-span-2">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full mx-auto mb-4 flex items-center justify-center">
                <User className="h-10 w-10 text-white" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">Welcome back!</h2>
              <p className="text-gray-600">You're successfully authenticated</p>
            </div>
          </div>

          {/* User Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="h-5 w-5 mr-2" />
                Profile Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <span className="text-gray-600">Email:</span>
                <span className="font-medium text-gray-900">{user.email}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-gray-600">Provider:</span>
                <Badge variant={user.provider === "LOCAL" ? "default" : "secondary"} className="flex items-center">
                  {user.provider === "LOCAL" ? (
                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  )}
                  {user.provider}
                </Badge>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-gray-600">Member since:</span>
                <span className="font-medium text-gray-900">
                  {format(new Date(user.createdAt), "MMMM d, yyyy")}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Session Status */}
          <Card className="bg-green-50 border-green-200">
            <CardHeader>
              <CardTitle className="flex items-center text-green-900">
                <Shield className="h-5 w-5 mr-2" />
                Session Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-green-700">
              <div className="flex items-center">
                <Clock className="h-4 w-4 mr-2" />
                <span>Access token valid for 15 minutes</span>
              </div>
              <div className="flex items-center">
                <FolderSync className="h-4 w-4 mr-2" />
                <span>Refresh token expires in 30 days</span>
              </div>
              <div className="flex items-center">
                <Shield className="h-4 w-4 mr-2" />
                <span>Session secured with httpOnly cookies</span>
              </div>
            </CardContent>
          </Card>

          {/* API Test Panel */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>API Test Panel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button 
                  variant="outline"
                  onClick={testAuthMe}
                  className="flex items-center justify-center"
                >
                  <UserCheck className="h-4 w-4 mr-2 text-blue-500" />
                  Test /auth/me
                </Button>
                <Button 
                  variant="outline"
                  onClick={refreshToken}
                  className="flex items-center justify-center"
                >
                  <RefreshCw className="h-4 w-4 mr-2 text-green-500" />
                  Refresh Token
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-gray-500 text-sm mb-4">
              SecureAuth - Enterprise Authentication System
            </p>
            <div className="flex justify-center space-x-6 text-sm text-gray-400">
              <span className="flex items-center">
                <Shield className="w-4 h-4 mr-1" />
                JWT Token Management
              </span>
              <span className="flex items-center">
                <Shield className="w-4 h-4 mr-1" />
                OAuth 2.0 Integration
              </span>
              <span className="flex items-center">
                <Shield className="w-4 h-4 mr-1" />
                Rate Limiting Protection
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
