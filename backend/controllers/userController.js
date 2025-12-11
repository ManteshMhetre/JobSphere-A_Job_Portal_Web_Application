import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/error.js";
import { UserModel } from "../models/userModel.js";
import { v2 as cloudinary } from "cloudinary";
import { sendToken } from "../utils/jwtToken.js";
import { convertPhoneToNumber } from "../utils/phoneUtils.js";

export const register = catchAsyncErrors(async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      password,
      role,
      firstNiche,
      secondNiche,
      thirdNiche,
      coverLetter,
    } = req.body;

    if (!name || !email || !phone || !address || !password || !role) {
      return next(new ErrorHandler("All fields are required.", 400));
    }
    if (role === "Job Seeker" && (!firstNiche || !secondNiche || !thirdNiche)) {
      return next(
        new ErrorHandler("Please provide your preferred job niches.", 400)
      );
    }

    // Validate user data
    const validationErrors = UserModel.validateUserData({
      name,
      email,
      phone,
      address,
      password,
      role,
      firstNiche,
      secondNiche,
      thirdNiche,
    });

    if (validationErrors.length > 0) {
      return next(new ErrorHandler(validationErrors.join(", "), 400));
    }

    // Check if user already exists
    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
      return next(new ErrorHandler("Email is already registered.", 400));
    }

    // Convert phone to integer
    let phoneNumber;
    try {
      phoneNumber = convertPhoneToNumber(phone);
    } catch (error) {
      return next(new ErrorHandler(error.message, 400));
    }

    const userData = {
      name,
      email,
      phone: phoneNumber,
      address,
      password,
      role,
      firstNiche,
      secondNiche,
      thirdNiche,
      coverLetter,
    };

    if (req.files && req.files.resume) {
      const { resume } = req.files;
      if (resume) {
        try {
          const cloudinaryResponse = await cloudinary.uploader.upload(
            resume.tempFilePath,
            { folder: "Job_Seekers_Resume" }
          );
          userData.resumeUrl = cloudinaryResponse.secure_url;
          userData.resumePublicId = cloudinaryResponse.public_id;
        } catch (error) {
          return next(new ErrorHandler("Failed to upload resume", 500));
        }
      }
    }

    const user = await UserModel.create(userData);
    const userResponse = UserModel.formatUserResponse(user);

    sendToken(userResponse, 201, res, "User Registered");
  } catch (error) {
    next(new ErrorHandler(error.message || "Registration failed", 500));
  }
});

export const login = catchAsyncErrors(async (req, res, next) => {
  const { role, email, password } = req.body;

  if (!role || !email || !password) {
    return next(
      new ErrorHandler("Email, password, and role are required.", 400)
    );
  }

  const user = await UserModel.findByEmail(email);
  if (!user) {
    return next(new ErrorHandler("Invalid email or password.", 400));
  }

  const isPasswordMatched = await UserModel.comparePassword(user, password);
  if (!isPasswordMatched) {
    return next(new ErrorHandler("Invalid email or password.", 400));
  }

  if (user.role !== role) {
    return next(new ErrorHandler("Invalid user role.", 400));
  }

  const userResponse = UserModel.formatUserResponse(user);
  sendToken(userResponse, 200, res, "User logged in successfully.");
});

export const logout = catchAsyncErrors(async (req, res, next) => {
  res
    .status(200)
    .cookie("token", "", {
      httpOnly: true,
      expires: new Date(Date.now()),
    })
    .json({
      success: true,
      message: "Logged out successfully.",
    });
});

export const getUser = catchAsyncErrors(async (req, res, next) => {
  const user = await UserModel.findById(req.user.id);

  if (!user) {
    return next(new ErrorHandler("User not found.", 404));
  }

  const userResponse = UserModel.formatUserResponse(user);

  res.status(200).json({
    success: true,
    user: userResponse,
  });
});

export const updateProfile = catchAsyncErrors(async (req, res, next) => {
  const newUserData = {
    name: req.body.name,
    email: req.body.email,
    phone: req.body.phone
      ? (() => {
          try {
            return convertPhoneToNumber(req.body.phone);
          } catch (error) {
            throw new ErrorHandler(error.message, 400);
          }
        })()
      : undefined,
    address: req.body.address,
    coverLetter: req.body.coverLetter,
    firstNiche: req.body.firstNiche,
    secondNiche: req.body.secondNiche,
    thirdNiche: req.body.thirdNiche,
  };

  const { firstNiche, secondNiche, thirdNiche } = newUserData;

  if (
    req.user.role === "Job Seeker" &&
    (!firstNiche || !secondNiche || !thirdNiche)
  ) {
    return next(
      new ErrorHandler("Please provide your all preferred job niches.", 400)
    );
  }

  if (req.files && req.files.resume) {
    const resume = req.files.resume;

    // Delete old resume if exists
    if (req.user.resumePublicId) {
      await cloudinary.uploader.destroy(req.user.resumePublicId);
    }

    try {
      const cloudinaryResponse = await cloudinary.uploader.upload(
        resume.tempFilePath,
        { folder: "Job_Seekers_Resume" }
      );
      newUserData.resumeUrl = cloudinaryResponse.secure_url;
      newUserData.resumePublicId = cloudinaryResponse.public_id;
    } catch (error) {
      return next(new ErrorHandler("Failed to upload resume", 500));
    }
  }

  const user = await UserModel.updateById(req.user.id, newUserData);

  if (!user) {
    return next(new ErrorHandler("Failed to update profile.", 500));
  }

  const userResponse = UserModel.formatUserResponse(user);

  res.status(200).json({
    success: true,
    message: "Profile updated.",
    user: userResponse,
  });
});

export const updatePassword = catchAsyncErrors(async (req, res, next) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return next(
      new ErrorHandler("Please provide old password and new password.", 400)
    );
  }

  const user = await UserModel.findById(req.user.id);

  if (!user) {
    return next(new ErrorHandler("User not found.", 404));
  }

  const isPasswordMatched = await UserModel.comparePassword(user, oldPassword);

  if (!isPasswordMatched) {
    return next(new ErrorHandler("Old password is incorrect.", 400));
  }

  const updatedUser = await UserModel.updateById(req.user.id, {
    password: newPassword,
  });

  if (!updatedUser) {
    return next(new ErrorHandler("Failed to update password.", 500));
  }

  res.status(200).json({
    success: true,
    message: "Password updated successfully.",
  });
});
