
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SMSOptInPage() {
  return (
    <div className="w-full min-h-screen bg-background">
      <Card className="border-0 rounded-none min-h-screen">
        <CardHeader>
          <CardTitle>SMS Opt In/Opt Out Information</CardTitle>
          <CardDescription>
            View our SMS notification opt-in and opt-out policy
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full" style={{ height: 'calc(100vh - 120px)' }}>
            <iframe
              src="/sms-opt-in-out"
              className="w-full h-full border-0"
              title="SMS Opt In/Opt Out Policy"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
