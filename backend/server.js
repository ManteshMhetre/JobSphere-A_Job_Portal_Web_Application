import app from "./app.js";
import cloudinary from "cloudinary";

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(
    `🚀 Job Portal Server (Raw PostgreSQL) listening at port ${port}`
  );
  console.log(`📊 Health check: http://localhost:${port}/api/health`);
  console.log(`🔗 API endpoints: http://localhost:${port}/api/v1/`);
});
