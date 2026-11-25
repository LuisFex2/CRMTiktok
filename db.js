import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Asegurar carpeta data
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Estructura inicial
const defaultData = {
  comments: [],
  logs: [],
  stats: {
    totalComments: 0,
    totalReplies: 0,
    aiReplies: 0,
    manualReplies: 0
  }
};

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
}

export class DB {
  static read() {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(content);
    } catch {
      return defaultData;
    }
  }

  static write(data) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error saving DB:', e.message);
    }
  }

  static addComment(comment) {
    const data = this.read();
    // Evitar duplicados por ID
    const exists = data.comments.find(c => c.id === comment.id);
    if (exists) return exists;

    data.comments.unshift(comment);
    data.stats.totalComments += 1;
    this.write(data);
    return comment;
  }

  static updateCommentReply(id, replyText, source = 'ai') {
    const data = this.read();
    const comment = data.comments.find(c => c.id === id);
    if (comment) {
      comment.status = 'replied';
      comment.replyText = replyText;
      comment.repliedAt = new Date().toISOString();
      comment.replySource = source;
      data.stats.totalReplies += 1;
      if (source === 'ai') {
        data.stats.aiReplies += 1;
      } else {
        data.stats.manualReplies += 1;
      }
      this.write(data);
      return comment;
    }
    return null;
  }

  static logEvent(type, details) {
    const data = this.read();
    data.logs.unshift({
      id: Date.now().toString(),
      type,
      timestamp: new Date().toISOString(),
      details
    });
    if (data.logs.length > 100) data.logs = data.logs.slice(0, 100);
    this.write(data);
  }
}
