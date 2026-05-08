from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


OUTPUT = Path("Team_Task_Manager_Demo_Video_Script.pdf")


sections = [
    (
        "Before Recording",
        [
            "Open these tabs before starting:",
            "1. GitHub repo: https://github.com/navin87895/team-task-manager",
            "2. Railway project/deployment page",
            "3. Live Railway app URL",
            "4. Optional local app: http://localhost:3000",
        ],
    ),
    (
        "1. Introduction (10-15 sec)",
        [
            "Open: GitHub repository page.",
            "Say: Hello, this is my Team Task Manager full-stack assignment. The app allows users to sign up, log in, create projects, manage team members, assign tasks, and track progress with role-based access control.",
            "Point out: repository name, server.js, public folder, README.md, and railway.json.",
        ],
    ),
    (
        "2. Tech Stack (15-20 sec)",
        [
            "Open: GitHub README or package.json.",
            "Say: The project is built with Node.js, Express, PostgreSQL support, JWT authentication, bcrypt password hashing, and a vanilla HTML, CSS, and JavaScript frontend. It uses REST APIs and proper validation.",
            "Point out: package.json, server.js, and README.md.",
        ],
    ),
    (
        "3. Deployment (15-20 sec)",
        [
            "Open: Railway project page.",
            "Say: The project is deployed on Railway. Railway is connected to my GitHub repository, and I added the required production environment variables.",
            "Point out: service name, deployment status, Variables tab, DATABASE_URL, JWT_SECRET, NODE_ENV, and live domain if available.",
            "Note: Do not show secret values for too long.",
        ],
    ),
    (
        "4. Signup and Login (30-40 sec)",
        [
            "Open: Live Railway app URL.",
            "Say: Now I will demonstrate authentication. Users can create an account and log in securely.",
            "Do: Sign up or log in with an admin account.",
            "Point out: signup form, login form, successful dashboard, and user role in sidebar.",
        ],
    ),
    (
        "5. Dashboard (25-35 sec)",
        [
            "Open: Dashboard page.",
            "Say: This dashboard shows total tasks, my open tasks, overdue tasks, total projects, and status distribution.",
            "Point out: Total tasks, My open tasks, Overdue, Projects, and Status distribution.",
        ],
    ),
    (
        "6. Project Management (40-50 sec)",
        [
            "Open: Projects tab.",
            "Say: Admins or project managers can create projects and manage project teams.",
            "Do: Create a project named Website Launch with a short description.",
            "Point out: project creation form, project list, and selected project details.",
        ],
    ),
    (
        "7. Team Management (30-40 sec)",
        [
            "Open: Selected project details.",
            "Say: Team members can be added to a project with project-level roles like manager or contributor.",
            "Do: Add a member account if available, or show the member controls.",
            "Point out: user dropdown, project role dropdown, and members list.",
        ],
    ),
    (
        "8. Task Creation (40-50 sec)",
        [
            "Open: New task form inside the selected project.",
            "Say: Project managers can create tasks, assign them to members, set priority, due date, and status.",
            "Do: Create a task named Prepare demo video with description Record assignment walkthrough, high priority, due date, and todo status.",
            "Point out: title, description, assignee, priority, due date, and task board.",
        ],
    ),
    (
        "9. Status Tracking (30-40 sec)",
        [
            "Open: Task board.",
            "Say: Tasks can move through different statuses: To do, In progress, Review, and Done.",
            "Do: Change the task status from To do to In progress.",
            "Point out: status dropdown and board columns.",
        ],
    ),
    (
        "10. Role-Based Access (20-30 sec)",
        [
            "Open: Sidebar and project/task controls.",
            "Say: The app includes role-based access control. Admins can manage everything, while members have limited access and can mainly update tasks assigned to them.",
            "Point out: Admin/Member role and manager/contributor project roles.",
        ],
    ),
    (
        "11. Closing (10-15 sec)",
        [
            "Open: Live app dashboard or GitHub README.",
            "Say: This completes the demo of my full-stack Team Task Manager. The project includes authentication, REST APIs, database relationships, validations, role-based access control, dashboard tracking, GitHub repository, README, and Railway deployment.",
        ],
    ),
    (
        "Final Submission Items",
        [
            "Live URL: your Railway app URL",
            "GitHub Repo: https://github.com/navin87895/team-task-manager",
            "README: included in repository",
            "Demo Video: this recording",
        ],
    ),
    (
        "Recording Tip",
        [
            "To keep the video under 5 minutes, create one admin account and one member account before recording. During the recording, log in and demonstrate the main workflow quickly.",
        ],
    ),
]


def build_pdf():
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=28,
        textColor=colors.HexColor("#14232d"),
        alignment=TA_LEFT,
        spaceAfter=14,
    )
    subtitle_style = ParagraphStyle(
        "Subtitle",
        parent=styles["BodyText"],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#657181"),
        spaceAfter=16,
    )
    heading_style = ParagraphStyle(
        "Heading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#1d7a8c"),
        spaceBefore=9,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor("#16202a"),
        spaceAfter=4,
    )

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=0.65 * inch,
        leftMargin=0.65 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.6 * inch,
        title="Team Task Manager Demo Video Script",
    )

    story = [
        Paragraph("Team Task Manager Demo Video Script", title_style),
        Paragraph("Use this as a 2-5 minute recording guide. Each section says what to open, what to say, and what to point out.", subtitle_style),
    ]

    for heading, bullets in sections:
        story.append(Paragraph(heading, heading_style))
        rows = []
        for item in bullets:
            rows.append([
                Paragraph("•", body_style),
                Paragraph(item, body_style),
            ])
        table = Table(rows, colWidths=[0.18 * inch, 6.75 * inch])
        table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(table)
        story.append(Spacer(1, 4))

    doc.build(story)


if __name__ == "__main__":
    build_pdf()
    print(OUTPUT.resolve())
