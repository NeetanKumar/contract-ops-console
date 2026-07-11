-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "attachment_filename" TEXT,
ADD COLUMN     "attachment_mime_type" TEXT,
ADD COLUMN     "attachment_size" INTEGER,
ADD COLUMN     "attachment_uploaded_at" TIMESTAMP(3);
