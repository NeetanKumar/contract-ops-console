-- AlterTable
ALTER TABLE "whatsapp_negotiations" ALTER COLUMN "direction" SET DEFAULT 'UNKNOWN';

-- CreateTable
CREATE TABLE "whatsapp_connections" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "waba_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "display_phone_number" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connections_org_id_key" ON "whatsapp_connections"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connections_phone_number_id_key" ON "whatsapp_connections"("phone_number_id");

-- AddForeignKey
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
