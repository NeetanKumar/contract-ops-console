/*
  Warnings:

  - You are about to drop the `whatsapp_chat_cursors` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "whatsapp_chat_cursors";

-- CreateTable
CREATE TABLE "whatsapp_processed_messages" (
    "message_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_processed_messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "whatsapp_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "active_org_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_settings_pkey" PRIMARY KEY ("id")
);
