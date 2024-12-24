/* eslint-disable react/no-unescaped-entities */

import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface MagicLinkEmailProps {
  email: string;
  url: string;
  token: string;
}

export const VerifyEmail = ({ email, url, token }: MagicLinkEmailProps) => (
  <Html>
    <Head />
    <Preview>Votre lien de connexion aux outils NEXUS</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={paragraph}>Salutations,</Text>
        <Text style={paragraph}>
          Utilisez le lien ci-dessous pour vérifier votre email et accéder à
          l'application.
        </Text>
        <Section style={btnContainer}>
          <Button style={button} href={url}>
            {token}
          </Button>
        </Section>
        <Text style={paragraph}>
          Bonne journée,
          <br />
          NEXUS Tools
        </Text>
      </Container>
    </Body>
  </Html>
);

VerifyEmail.PreviewProps = {
  email: "kevin.thizy@intech.lu",
  url: "https://intech.lu",
} as MagicLinkEmailProps;

export default VerifyEmail;

const main = {
  backgroundColor: "#d9d6cf",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
};

const logo = {
  margin: "0 auto",
};

const paragraph = {
  fontSize: "16px",
  lineHeight: "26px",
};

const btnContainer = {
  textAlign: "center" as const,
};

const button = {
  backgroundColor: "#3C463B",
  borderRadius: "3px",
  color: "#BEC0B0",
  fontSize: "16px",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px",
};

const hr = {
  borderColor: "#cccccc",
  margin: "20px 0",
};

const footer = {
  color: "#8898aa",
  fontSize: "12px",
};
