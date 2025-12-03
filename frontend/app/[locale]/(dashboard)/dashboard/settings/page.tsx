"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const [rules, setRules] = useState([
    { id: 1, trigger: "hello", response: "Hi there! How can I help?" },
    { id: 2, trigger: "pricing", response: "Our pricing starts at $99/month" },
  ]);
  const [newRule, setNewRule] = useState({ trigger: "", response: "" });

  const handleAddRule = () => {
    if (newRule.trigger && newRule.response) {
      setRules([...rules, { id: Date.now(), ...newRule }]);
      setNewRule({ trigger: "", response: "" });
    }
  };

  const handleDeleteRule = (id: number) => {
    setRules(rules.filter((rule) => rule.id !== id));
  };

  return (
    <div className="space-y-6 p-4 lg:p-8">
      <div>
        <h1 className="text-lg lg:text-2xl font-medium">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t("profileSettings")}</CardTitle>
          <CardDescription>{t("updateInfo")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">{t("displayName")}</Label>
            <Input
              id="name"
              placeholder={t("yourName")}
              defaultValue="John Doe"
            />
          </div>
          <div>
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t("yourEmail")}
              defaultValue="john@example.com"
            />
          </div>
          <Button>{t("saveChanges")}</Button>
        </CardContent>
      </Card>

      {/* Integration Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t("integrationSettings")}</CardTitle>
          <CardDescription>{t("configureIntegration")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg p-4 space-y-4">
            <div>
              <h3 className="font-semibold text-sm mb-2">
                {t("whatsappIntegration")}
              </h3>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="twilio-account">{t("twilioAccount")}</Label>
                  <Input
                    id="twilio-account"
                    placeholder={t("twilioAccountPlaceholder")}
                    type="password"
                  />
                </div>
                <div>
                  <Label htmlFor="twilio-token">{t("twilioToken")}</Label>
                  <Input
                    id="twilio-token"
                    placeholder={t("twilioTokenPlaceholder")}
                    type="password"
                  />
                </div>
                <div>
                  <Label htmlFor="whatsapp-number">{t("whatsappNumber")}</Label>
                  <Input
                    id="whatsapp-number"
                    placeholder={t("whatsappNumberPlaceholder")}
                  />
                </div>
              </div>
            </div>
            <Separator />
            <Button variant="outline">{t("testConnection")}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Automation Rules Editor */}
      <Card>
        <CardHeader>
          <CardTitle>{t("automationRules")}</CardTitle>
          <CardDescription>{t("createRules")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add New Rule Form */}
          <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
            <h3 className="font-semibold text-sm">{t("addNewRule")}</h3>
            <div>
              <Label htmlFor="trigger">{t("triggerKeyword")}</Label>
              <Input
                id="trigger"
                placeholder={t("triggerPlaceholder")}
                value={newRule.trigger}
                onChange={(e) =>
                  setNewRule({ ...newRule, trigger: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="response">{t("automaticResponse")}</Label>
              <Input
                id="response"
                placeholder={t("responsePlaceholder")}
                value={newRule.response}
                onChange={(e) =>
                  setNewRule({ ...newRule, response: e.target.value })
                }
              />
            </div>
            <Button onClick={handleAddRule} className="gap-2">
              <Plus className="h-4 w-4" />
              {t("addRule")}
            </Button>
          </div>

          {/* Rules List */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">{t("currentRules")}</h3>
            {rules.length > 0 ? (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-start justify-between p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        {t("trigger")}{" "}
                        <code className="bg-muted px-2 py-1 rounded text-xs">
                          {rule.trigger}
                        </code>
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t("response")}: {rule.response}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRule(rule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noRules")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Feature Toggles */}
      <Card>
        <CardHeader>
          <CardTitle>{t("features")}</CardTitle>
          <CardDescription>{t("enableDisable")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{t("emotionAnalysis")}</p>
              <p className="text-xs text-muted-foreground">
                {t("emotionAnalysisDesc")}
              </p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{t("autoResponse")}</p>
              <p className="text-xs text-muted-foreground">
                {t("autoResponseDesc")}
              </p>
            </div>
            <Switch />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{t("messageNotifications")}</p>
              <p className="text-xs text-muted-foreground">
                {t("notificationsDesc")}
              </p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
