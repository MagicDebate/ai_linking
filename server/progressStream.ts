import { EventEmitter } from 'events';

interface ProgressData {
  runId: string;
  phase: string;
  percent: number;
  generated: number;
  rejected: number;
}

class ProgressStreamManager extends EventEmitter {
  private activeStreams: Map<string, Set<any>> = new Map();

  addClient(runId: string, res: any) {
    if (!this.activeStreams.has(runId)) {
      this.activeStreams.set(runId, new Set());
    }
    this.activeStreams.get(runId)!.add(res);

    // Setup SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection
    this.sendToClient(res, { type: 'connected', runId });

    // Handle client disconnect
    res.on('close', () => {
      this.removeClient(runId, res);
    });

    res.on('error', () => {
      this.removeClient(runId, res);
    });
  }

  removeClient(runId: string, res: any) {
    const clients = this.activeStreams.get(runId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        this.activeStreams.delete(runId);
      }
    }
  }

  broadcastProgress(data: ProgressData) {
    const clients = this.activeStreams.get(data.runId);
    if (clients) {
      clients.forEach(res => {
        this.sendToClient(res, {
          type: 'progress',
          ...data
        });
      });
    }
  }

  broadcastCompletion(runId: string, success: boolean, message?: string) {
    const clients = this.activeStreams.get(runId);
    if (clients) {
      clients.forEach(res => {
        this.sendToClient(res, {
          type: 'completed',
          runId,
          success,
          message
        });
        res.end();
      });
      this.activeStreams.delete(runId);
    }
  }

  private sendToClient(res: any, data: any) {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error('Error sending SSE data:', error);
    }
  }

  getActiveRunsCount(): number {
    return this.activeStreams.size;
  }

  hasActiveClients(runId: string): boolean {
    const clients = this.activeStreams.get(runId);
    return clients && clients.size > 0 || false;
  }
}

export const progressStreamManager = new ProgressStreamManager();