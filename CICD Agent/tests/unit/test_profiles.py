from runtime.config.profiles import get_profile, load_profiles


def test_load_default_profiles_has_default():
    profiles = load_profiles()
    assert "default" in profiles
    assert "python-api" in profiles
    assert profiles["python-api"].test.command.startswith("pytest")


def test_get_profile_falls_back_to_default():
    p = get_profile("not-a-real-profile")
    assert p.name == "default"


def test_dotnet_profile_has_build_command():
    p = get_profile("dotnet-api")
    assert p.build.command.startswith("dotnet build")
    assert "csharp" in p.languages
