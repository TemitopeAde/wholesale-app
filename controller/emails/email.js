const nodemailer = require('nodemailer');
const pdf = require('html-pdf-node');
require('dotenv').config();


// const sendEmail = async (recipient, subject, data) => {
//   try {
//     let transporter = nodemailer.createTransport({
//       host: "smtp.protonmail.ch",
//       port: 587,
//       secure: false,
//       auth: {
//         user: process.env.PROTON_USER,
//         pass: process.env.PROTON_PASSWORD
//       }
//     });

//     const mailOptions = {
//       from: process.env.PROTON_USER,
//       to: recipient,
//       subject: subject,
//       html: data?.emailTemplate 
//     };

//     const info = await transporter.sendMail(mailOptions);
//     return `Email sent successfully: ${info.messageId}`;
//   } catch (error) {
//     console.error('Error sending email:', error);
//     throw new Error('Failed to send email.');
//   }
// };


// const sendProtonEmail = async (req, res) => {
//   try {
//     const { email, subject, data } = req.body;
//     console.log({data});
    
//     await sendEmail(email, subject, data);
    
//     return res.status(200).json({
//       success: true
//     });

//   } catch (err) {
//     console.error('Unexpected error:', err);
//     return res.status(400).json({
//       success: false,
//       error: 'Bad request'
//     });
//   }
// };


const sendProtonEmail = async (req, res) => {
  try {
    const { email, subject, data } = req.body;

    if (!email || !subject || !data) {
      return res.status(400).json({
        success: false,
        error: 'Missing email, subject, or emailTemplate'
      });
    }

    // Convert HTML to PDF
    const file = { content: data}; // HTML string
    const options = { format: 'A4' };

    const pdfBuffer = await new Promise((resolve, reject) => {
      pdf.generatePdf(file, options, (err, buffer) => {
        if (err) reject(err);
        else resolve(buffer);
      });
    });

    const emailPayload = {
      to: email,
      subject: subject,
      html: data,
      attachments: [
        {
          filename: 'quote.pdf',
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    // Send the email
    await sendEmail(emailPayload);

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(400).json({
      success: false,
      error: 'Bad request'
    });
  }
};

const sendEmail = async ({ to, subject, html, attachments }) => {
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.protonmail.ch',
      port: 587,
      secure: false,
      auth: {
        user: process.env.PROTON_USER,
        pass: process.env.PROTON_PASSWORD
      }
    });

    const mailOptions = {
      from: process.env.PROTON_USER,
      to,
      subject,
      html,
      attachments
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.messageId}`);
    return info.messageId;

  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send email.');
  }
};

module.exports = {
  sendProtonEmail
};