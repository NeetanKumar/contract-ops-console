-- CreateTable
CREATE TABLE "whatsapp_chat_cursors" (
    "chat_id" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_chat_cursors_pkey" PRIMARY KEY ("chat_id")
);
