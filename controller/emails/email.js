const nodemailer = require('nodemailer');
require('dotenv').config();


const sendEmail = async (recipient, subject, data) => {
  try {
    let transporter = nodemailer.createTransport({
      host: "smtp.protonmail.ch",
      port: 587,
      secure: false,
      auth: {
        user: process.env.PROTON_USER,
        pass: process.env.PROTON_PASSWORD
      }
    });

    const mailOptions = {
      from: process.env.PROTON_USER,
      to: recipient,
      subject: subject,
      html: data?.emailTemplate 
    };

    const info = await transporter.sendMail(mailOptions);
    return `Email sent successfully: ${info.messageId}`;
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send email.');
  }
};


const sendProtonEmail = async (req, res) => {
  try {
    const { email, subject, data } = req.body;
    await sendEmail(email, subject, data);
    
    return res.status(200).json({
      success: true
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(400).json({
      success: false,
      error: 'Bad request'
    });
  }
};

module.exports = {
  sendProtonEmail
};