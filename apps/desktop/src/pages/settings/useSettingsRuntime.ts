import { useEffect, useRef, useState } from "react";
import {
  configureDaemon,
  fetchAuthStatus,
  fetchDaemonConfig,
  fetchHealth,
  testLlmConfig,
  type AuthUser,
  type HealthStatus,
} from "../../api";
import {
  additionalModelIsConfigured,
  createEmptyAdditionalModel,
  llmConfigFromModel,
  loadSettings,
  saveSettings,
  type AdditionalModelConfig,
  type AppSettings,
  type DaemonStatus,
} from "./settingsTypes.js";

export function useSettingsRuntime() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [saved, setSaved] = useState(false);
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus>("unknown");
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser>({ authenticated: false });
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [modelDraft, setModelDraft] = useState<AdditionalModelConfig>(createEmptyAdditionalModel);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didHydrateDaemonRef = useRef(false);

  useEffect(() => {
    setDaemonStatus("checking");
    fetchHealth()
      .then((result) => {
        setHealth(result);
        setDaemonStatus(result.llmConfigured ? "configured" : "unconfigured");
      })
      .catch(() => setDaemonStatus("unreachable"));

    fetchAuthStatus()
      .then(setAuthUser)
      .catch(() => {
        setAuthUser({ authenticated: false });
      });
    fetchDaemonConfig()
      .then((config) => {
        if (!config) return;
        setSettings((current) => ({
          ...current,
          azureTenantId: config.azureTenantId ?? current.azureTenantId,
          azureClientId: config.azureClientId ?? current.azureClientId,
        }));
      })
      .catch(() => undefined)
      .finally(() => {
        didHydrateDaemonRef.current = true;
      });
  }, []);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveSettings(settings);
      setSaved(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setSaved(false), 1500);
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [settings]);

  useEffect(() => {
    if (!didHydrateDaemonRef.current) return;
    const tenantId = settings.azureTenantId.trim();
    const clientId = settings.azureClientId.trim();
    const timer = setTimeout(() => {
      configureDaemon({
        azureTenantId: tenantId,
        azureClientId: clientId,
      }).catch(() => undefined);
    }, 900);
    return () => clearTimeout(timer);
  }, [settings.azureTenantId, settings.azureClientId]);

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function startAddingModel(): void {
    setEditingModelId("new");
    setModelDraft(createEmptyAdditionalModel());
  }

  function startEditingModel(model: AdditionalModelConfig): void {
    setEditingModelId(model.id);
    setModelDraft({ ...model });
  }

  function cancelModelEdit(): void {
    setEditingModelId(null);
    setModelDraft(createEmptyAdditionalModel());
  }

  function saveModelDraft(): void {
    setSettings((current) => {
      const saved = {
        ...modelDraft,
        label: modelDraft.label.trim(),
        azureEndpoint: modelDraft.azureEndpoint.trim(),
        azureDeployment: modelDraft.azureDeployment.trim(),
        azureApiVersion: modelDraft.azureApiVersion.trim(),
        openaiModel: modelDraft.openaiModel.trim(),
      };
      const exists = current.additionalModels.some((model) => model.id === saved.id);
      return {
        ...current,
        additionalModels: exists
          ? current.additionalModels.map((model) => (model.id === saved.id ? saved : model))
          : [...current.additionalModels, saved],
      };
    });
    cancelModelEdit();
  }

  function updateModelDraft<K extends keyof AdditionalModelConfig>(
    key: K,
    value: AdditionalModelConfig[K],
  ): void {
    setModelDraft((current) => {
      const next = { ...current, [key]: value };
      if (
        key === "provider" ||
        key === "azureEndpoint" ||
        key === "azureApiKey" ||
        key === "azureDeployment" ||
        key === "azureApiVersion" ||
        key === "openaiApiKey" ||
        key === "openaiModel"
      ) {
        return { ...next, enabled: false, available: false, testedAt: "", testError: "" };
      }
      return next;
    });
  }

  async function testModel(
    model: AdditionalModelConfig,
    source: "draft" | "saved" = "saved",
  ): Promise<boolean> {
    if (!additionalModelIsConfigured(model)) {
      const failed = {
        ...model,
        enabled: false,
        available: false,
        testError: "Required fields are missing.",
      };
      updateTestedModel(failed, source);
      return false;
    }
    setTestingModelId(model.id);
    try {
      await testLlmConfig(llmConfigFromModel(model));
      const passed = {
        ...model,
        enabled: true,
        available: true,
        testedAt: new Date().toISOString(),
        testError: "",
      };
      updateTestedModel(passed, source);
      return true;
    } catch (err) {
      const failed = {
        ...model,
        enabled: false,
        available: false,
        testedAt: "",
        testError: err instanceof Error ? err.message : String(err),
      };
      updateTestedModel(failed, source);
      return false;
    } finally {
      setTestingModelId((current) => (current === model.id ? null : current));
    }
  }

  function disableModel(model: AdditionalModelConfig): void {
    setSettings((current) => ({
      ...current,
      additionalModels: current.additionalModels.map((item) =>
        item.id === model.id ? { ...item, enabled: false, available: false } : item,
      ),
    }));
  }

  function deleteModel(model: AdditionalModelConfig): void {
    setSettings((current) => ({
      ...current,
      additionalModels: current.additionalModels.filter((item) => item.id !== model.id),
    }));
    if (editingModelId === model.id) cancelModelEdit();
  }

  function updateTestedModel(model: AdditionalModelConfig, source: "draft" | "saved"): void {
    if (source === "draft") {
      setModelDraft(model);
      return;
    }
    setSettings((current) => ({
      ...current,
      additionalModels: current.additionalModels.map((item) =>
        item.id === model.id ? model : item,
      ),
    }));
  }

  return {
    settings,
    saved,
    daemonStatus,
    health,
    authUser,
    editingModelId,
    modelDraft,
    testingModelId,
    availableAdditionalModels: settings.additionalModels.filter(
      (model) => model.enabled && model.available,
    ),
    set,
    setModelDraft,
    startAddingModel,
    startEditingModel,
    cancelModelEdit,
    saveModelDraft,
    updateModelDraft,
    testModel,
    disableModel,
    deleteModel,
  };
}
