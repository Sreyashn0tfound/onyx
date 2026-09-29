from prisma import Prisma
import asyncio

# Initialize the global Prisma client
db = Prisma()

async def connect_db():
    if not db.is_connected():
        await db.connect()
        print("[Onyx Engine] Connected to Postgres Database.")

async def disconnect_db():
    if db.is_connected():
        await db.disconnect()
        print("[Onyx Engine] Disconnected from Postgres Database.")