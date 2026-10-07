import { File } from '../models/mongo/File.js';

export async function saveFile(ownerId, kind, multerFile) {
  const doc = await File.create({
    ownerId, kind,
    filename: multerFile.originalname,
    mimeType: multerFile.mimetype,
    size: multerFile.size,
    data: multerFile.buffer,
  });
  return doc._id.toString();
}

export async function getFile(id) {
  return File.findById(id);
}
