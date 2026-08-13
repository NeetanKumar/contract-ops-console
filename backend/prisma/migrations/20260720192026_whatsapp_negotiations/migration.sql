/*
  Warnings:

  - You are about to drop the `whatsapp_settings` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "WhatsAppNegotiationStatus" AS ENUM ('OPEN', 'AGREED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "WhatsAppDealDirection" AS ENUM ('WE_BUY', 'WE_SELL');

-- DropTable
DROP TABLE "whatsapp_settings";

-- CreateTable
CREATE TABLE "whatsapp_negotiations" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "our_phone" TEXT NOT NULL,
    "counterparty_phone" TEXT NOT NULL,
    "direction" "WhatsAppDealDirection" NOT NULL,
    "label" TEXT,
    "status" "WhatsAppNegotiationStatus" NOT NULL DEFAULT 'OPEN',
    "lines" JSONB NOT NULL DEFAULT '[]',
    "resulting_contract_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_negotiations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_unmatched_messages" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "from" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_unmatched_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_negotiations_org_id_status_idx" ON "whatsapp_negotiations"("org_id", "status");

-- CreateIndex
CREATE INDEX "whatsapp_negotiations_our_phone_status_idx" ON "whatsapp_negotiations"("our_phone", "status");

-- CreateIndex
CREATE INDEX "whatsapp_negotiations_counterparty_phone_status_idx" ON "whatsapp_negotiations"("counterparty_phone", "status");

-- CreateIndex
CREATE INDEX "whatsapp_unmatched_messages_org_id_idx" ON "whatsapp_unmatched_messages"("org_id");

-- AddForeignKey
ALTER TABLE "whatsapp_negotiations" ADD CONSTRAINT "whatsapp_negotiations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_unmatched_messages" ADD CONSTRAINT "whatsapp_unmatched_messages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
