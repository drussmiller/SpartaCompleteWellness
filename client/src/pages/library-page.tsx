import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BottomNav } from "@/components/bottom-nav";
import { Video, Library as LibraryIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface Video {
  id: number;
  title: string;
  description: string;
  url: string;
  thumbnail?: string;
  category: string;
}

export default function LibraryPage() {
  const { data: videos } = useQuery<Video[]>({
    queryKey: ["/api/videos"],
  });

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="p-4">
          <h1 className="text-xl font-bold">Video Library</h1>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {!videos || videos.length === 0 ? (
          <div className="text-center py-8">
            <LibraryIcon className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">No videos available</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {videos.map((video) => (
              <Card key={video.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Video className="h-5 w-5" />
                    {video.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video rounded-md overflow-hidden bg-muted">
                    {video.thumbnail ? (
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Video className="h-12 w-12 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">
                    {video.description}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Category: {video.category}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
