import { prisma } from '../src/shared/database/prisma-client.js';
import { archiveDisplayContent, extractMediaCandidates } from '../src/modules/archive/archive-format.js';

async function main() {
  let cursor: string | undefined;
  let scanned = 0;
  let updatedMessages = 0;
  let createdMedia = 0;

  while (true) {
    const messages = await prisma.archiveMessage.findMany({
      take: 200,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        contentType: true,
        contentSnapshot: true,
        attachmentsSnapshot: true,
        media: { select: { sourceUrl: true } },
      },
    });
    if (messages.length === 0) break;

    for (const message of messages) {
      scanned += 1;
      const existing = new Set(message.media.map((item) => item.sourceUrl));
      const media = extractMediaCandidates(
        message.contentType,
        message.attachmentsSnapshot,
        message.contentSnapshot,
      ).filter((item) => !existing.has(item.url));
      const readableContent = archiveDisplayContent(message.contentSnapshot, message.contentType);

      await prisma.$transaction(async (tx) => {
        if (readableContent !== message.contentSnapshot) {
          await tx.archiveMessage.update({
            where: { id: message.id },
            data: { contentSnapshot: readableContent },
          });
          updatedMessages += 1;
        }
        if (media.length > 0) {
          const result = await tx.archiveMedia.createMany({
            data: media.map((item) => ({
              archiveMessageId: message.id,
              mediaType: item.mediaType,
              sourceUrl: item.url,
              fileName: item.fileName,
              mimeType: item.mimeType,
              sizeBytes: item.sizeBytes,
            })),
            skipDuplicates: true,
          });
          createdMedia += result.count;
        }
      });
    }
    cursor = messages.at(-1)?.id;
  }

  console.log(JSON.stringify({ scanned, updatedMessages, createdMedia }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
