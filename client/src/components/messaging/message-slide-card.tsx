import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function MessageSlideCard() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        size="icon"
        className="h-10 w-10 bg-gray-200 hover:bg-gray-300 ml-2"
        onClick={() => setIsOpen(true)}
      >
        <MessageCircle className="h-16 w-16 text-black font-extrabold" />
      </Button>

      {/* Slide-out card */}
      <div
        className={`fixed inset-y-0 right-0 w-96 bg-background shadow-xl transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        } z-50`}
      >
        <Card className="h-full rounded-none">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Messages</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="p-4">
            <p className="text-muted-foreground text-center">
              Messaging feature coming soon!
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
